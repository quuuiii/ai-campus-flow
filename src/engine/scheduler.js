// 規則式排程引擎（非機器學習）：解析需求 → 算空堂 → 依偏好挑地點 → 衝突偵測 → 一鍵重新調配
// 保證：任務只會落在空堂內，不與課程或其他任務重疊；步行、排隊與緩衝都計入。
import { PLACES, KINDS, BUILDINGS, walk, walkSource, placeName } from '../data/places.js';
import { queueMin, approx, SOURCE_LABEL, defaultCrowdFn, isClosed } from './crowd.js';
import { toMin, fmt } from '../util.js';

// ── 自然語言需求解析（規則式，非大型語言模型）──
const CN = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
// 中文數字 0–99（十、十五、二十、二十五、兩…）或阿拉伯數字（含小數）
export function cnNum(str) {
  const s = String(str).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return +s;
  if (!/^[零〇一二兩三四五六七八九十]+$/.test(s)) return null;
  if (!s.includes('十')) return s.length === 1 ? CN[s] : null;
  const [h, l] = s.split('十');
  if (s.split('十').length > 2) return null;
  const tens = h === '' ? 1 : CN[h], ones = l === '' ? 0 : CN[l];
  return tens == null || ones == null || h.length > 1 || l.length > 1 ? null : tens * 10 + ones;
}
const NUM = '(\\d+(?:\\.\\d+)?|[零〇一二兩三四五六七八九十]+)';
const FILLER = /^(我|今天|今日|然後|另外|幫我|請|想|要|好|謝謝|嗎|吧|的|了|一下)+$/;
const KIND_RULES = [
  ['meal', /午餐|午飯|吃飯|用餐|晚餐|晚飯|吃東西|吃點|吃/],
  ['group', /討論|小組|開會|組員|組會|meeting/i],
  ['homework', /作業|報告|專題|論文|週報|寫完|完成|交/],
  ['study', /圖書館|讀書|自習|K書|念書|唸書|複習|預習|看書/i],
  ['errand', /行政|辦事|影印|印|繳|註冊|申請|領|郵局|教務處|學務處/],
];

function parseDuration(seg) {
  let m;
  if ((m = seg.match(new RegExp(NUM + '\\s*個?\\s*半\\s*(?:小時|鐘頭)')))) { const n = cnNum(m[1]); if (n != null) return Math.round(n * 60) + 30; }
  if ((m = seg.match(new RegExp(NUM + '\\s*個?\\s*(?:小時|鐘頭)(半)?')))) { const n = cnNum(m[1]); if (n != null) return Math.round(n * 60) + (m[2] ? 30 : 0); }
  if (/半(?:個)?(?:小時|鐘頭)/.test(seg)) return 30;
  if ((m = seg.match(new RegExp(NUM + '\\s*分(?:鐘)?')))) { const n = cnNum(m[1]); if (n != null) return Math.round(n); }
  return null;
}

// 回傳 {minute, assumed}；assumed 表示上下午是推測的
function parseDeadline(seg) {
  let m = seg.match(/(\d{1,2})\s*[:：]\s*(\d{2})\s*(?:之|以)?前/);
  let h, mm = 0, period = '';
  if (m) { h = +m[1]; mm = +m[2]; }
  else {
    m = seg.match(new RegExp('(上午|早上|中午|下午|傍晚|晚上)?\\s*' + NUM + '\\s*[點時]\\s*(半|' + NUM + '\\s*分?)?\\s*(?:之|以)?前'));
    if (!m) return null;
    period = m[1] || ''; h = cnNum(m[2]);
    if (h == null) return null;
    if (m[3] === '半') mm = 30; else if (m[4]) mm = cnNum(m[4]) ?? 0;
    // 「中午」與 12 點前後
    if (!period) { const pm = seg.match(/(上午|早上|中午|下午|傍晚|晚上)/); period = pm ? pm[1] : ''; }
  }
  if (h > 24 || mm > 59) return null;
  let assumed = false;
  if (/下午|傍晚|晚上/.test(period) && h < 12) h += 12;
  else if (period === '中午' && h <= 2) h += 12;
  else if (!period && h >= 1 && h <= 7) { h += 12; assumed = true; }
  return { minute: Math.min(h * 60 + mm, 1439), assumed };
}

// 指定地點（寫到哪裡就去哪裡；「圖書館」太籠統，不指定）
const PLACE_RULES = [
  ['backdoor', /後門/], ['nightmarket', /宵夜街/], ['pinecone', /松果/], ['female14', /女十四|女14/],
  ['male9_711', /7-?11|7－11|小七|seven|男九/i], ['mainlib', /總圖/], ['zhongzheng', /中正圖|K書中心|舊圖/i], ['admin', /行政大樓|行政/],
];
const PERIOD = '(上午|早上|中午|下午|傍晚|晚上)?';
const toH = (h, period, assumePm) => {
  if (/下午|傍晚|晚上/.test(period) && h < 12) return h + 12;
  if (period === '中午' && h <= 2) return h + 12;
  if (!period && assumePm && h >= 1 && h <= 7) return h + 12;
  return h;
};
// 「六點到九點」「晚上 6 點半～9 點」「18:00-21:00」→ {start, end, assumed}
function parseRange(seg) {
  let m = seg.match(/(\d{1,2})\s*[:：]\s*(\d{2})\s*(?:到|至|~|～|-|－|—)\s*(\d{1,2})\s*[:：]\s*(\d{2})/);
  if (m) { const a = +m[1] * 60 + +m[2], b = +m[3] * 60 + +m[4]; return a < b ? { start: a, end: b, assumed: false } : null; }
  m = seg.match(new RegExp(PERIOD + '\\s*' + NUM + '\\s*[點時](半)?\\s*(?:到|至|~|～|-|－|—)\\s*' + PERIOD + '\\s*' + NUM + '\\s*[點時]?(半)?'));
  if (!m) return null;
  const p1 = m[1] || '', p2 = m[4] || p1, h1 = cnNum(m[2]), h2 = cnNum(m[5]);
  if (h1 == null || h2 == null || h1 > 24 || h2 > 24) return null;
  let a = toH(h1, p1, true) * 60 + (m[3] ? 30 : 0), b = toH(h2, p2, true) * 60 + (m[6] ? 30 : 0);
  if (b <= a && b + 720 > a && h2 < 12) b += 720; // 「下午一點到五點」的第二段沿用下午
  if (!(a < b) || b > 1440) return null;
  return { start: a, end: b, assumed: !p1 && h1 >= 1 && h1 <= 7 };
}
// 只說時段沒說幾點
const DAYPART = [[/晚上/, [1080, 1320]], [/傍晚/, [1020, 1140]], [/下午/, [780, 1080]], [/上午|早上/, [480, 720]], [/中午/, [690, 810]]];

// 解析整段需求：回傳任務與「看不懂的片段」，看不懂的不會被默默丟掉
export function parseRequest(text) {
  const segs = String(text || '').split(/[，,。；;、\n！!？?]|還要|還有|然後|以及|另外/).map((x) => x.trim()).filter(Boolean);
  const tasks = [], unknown = [], notes = [];
  for (const seg of segs) {
    const rule = KIND_RULES.find(([, re]) => re.test(seg));
    if (!rule) { if (!FILLER.test(seg) && seg.length >= 2) unknown.push(seg); continue; }
    const kind = rule[0];
    const d = parseDuration(seg);
    const dur = Math.max(10, Math.min(240, d ?? KINDS[kind].dur));
    const task = { id: kind + tasks.length, kind, dur, text: seg, durGuessed: d == null };
    const range = parseRange(seg);
    if (range) {
      // 指定時段：在這段時間內完成；沒寫時長就用整段
      task.window = [range.start, range.end]; task.deadline = range.end; task.userWindow = true;
      if (d == null) { task.dur = Math.max(10, Math.min(240, range.end - range.start)); task.durGuessed = false; }
      if (range.assumed) notes.push(`「${seg}」推測為 ${fmt(range.start)}–${fmt(range.end)}，如不正確請手動修改`);
    } else {
      const dl = parseDeadline(seg);
      if (dl) { task.deadline = dl.minute; if (dl.assumed) notes.push(`「${seg}」的時間推測為 ${fmt(dl.minute)}，如不正確請手動修改`); }
      if (kind === 'meal' && /晚餐|晚飯/.test(seg)) task.window = [1020, 1200];
      else if (kind === 'meal' && /午餐|午飯|中午/.test(seg)) task.window = [660, 870];
      else { const dp = DAYPART.find(([re]) => re.test(seg)); if (dp) { task.window = [...dp[1]]; task.userWindow = true; } }
    }
    const pl = PLACE_RULES.find(([, re]) => re.test(seg));
    if (pl) {
      if (PLACES[pl[0]].kinds.includes(kind)) task.place = pl[0];
      else notes.push(`「${seg}」提到的${PLACES[pl[0]].short}不適合「${KINDS[kind].label}」，已改由系統挑選地點`);
    }
    tasks.push(task);
  }
  return { tasks, unknown, notes };
}
export const parseTasks = (text) => parseRequest(text).tasks;

// ── 空堂計算（含前後課堂所在建築）──
// origin：沒有前一堂課時的出發地點
export function computeSlots(courses, day, win, origin = null) {
  const cs = courses
    .filter((c) => +c.day === +day)
    .map((c) => ({ ...c, s: toMin(c.start), e: toMin(c.end) }))
    .filter((c) => c.e > c.s)
    .sort((a, b) => a.s - b.s);
  const slots = [];
  let cur = win.start, prev = origin;
  for (const c of cs) {
    if (c.e <= win.start) { prev = c.building || origin; continue; }
    if (c.s >= win.end) break;
    if (c.s > cur) slots.push({ s: cur, e: Math.min(c.s, win.end), prev, next: c.building || null, nextName: c.name, nextStart: c.s < win.end ? c.s : null, hasNext: c.s < win.end });
    cur = Math.max(cur, c.e);
    prev = c.building || origin;
  }
  if (cur < win.end) slots.push({ s: cur, e: win.end, prev, next: null, hasNext: false });
  return slots.filter((s) => s.e - s.s >= 15);
}

// ── 候選地點評分（分數越低越好）──
function score(mode, kind, p, c) {
  const w = c.walkIn + c.walkOut;
  const social = kind === 'meal' || kind === 'errand';
  let s;
  if (mode === 'walk') s = w * 10 + c.pct * 0.05 + c.queue * 0.5;
  else if (mode === 'focus') s = social ? (w + c.queue + c.dur) * 3 + c.pct * 0.3 : (5 - (p.quiet ?? 3)) * 25 + c.pct * 0.4 + w;
  else s = c.pct + w * 1.5 + c.queue * 2 + (kind === 'study' || kind === 'homework' ? (5 - p.quiet) * 8 : 0);
  if (c.sticky) s -= 12; // 連續任務留在同一地點，少走冤枉路
  return s;
}

// buffer：每次「移動前」預留的緩衝（同一空堂內換地點前、回到下一堂課前各一次，不重複計算）
function evaluate(t, sl, want, ctx, slotItems) {
  const buf = ctx.buffer;
  const pool = slotItems.reduce((a, it) => a + (KINDS[it.task.kind].flex ? it.dur - it.minDur : 0), 0);
  const out = [];
  for (const p of Object.values(PLACES)) {
    if (!p.kinds.includes(t.kind) || isClosed(p, ctx.day)) continue;
    if (t.place && p.id !== t.place) continue; // 使用者指定的地點，不換
    const walkIn = walk(sl.loc, p.id);
    const moveBuf = slotItems.length > 0 && walkIn > 0 ? buf : 0;
    const arrive = sl.cur + moveBuf + walkIn;
    const win = t.window || KINDS[t.kind].window;
    if (win && arrive > win[1]) continue;
    let start = arrive;
    if (win && start < win[0]) start = win[0];
    const cr = ctx.crowd(p, arrive);
    const pct = cr.pct;
    const queue = t.kind === 'meal' || t.kind === 'errand' ? queueMin(pct, p) : 0;
    start += queue;
    const baseDur = t.kind === 'meal' ? p.eat ?? want : want;
    // 下一堂課未填教室時，步行以預設值估算，緩衝照樣保留
    const walkOut = sl.hasNext ? walk(p.id, sl.next) : 0;
    const limit = Math.min(sl.e - walkOut - (sl.hasNext ? buf : 0), t.deadline ?? 1e9, t.userWindow && t.window ? t.window[1] : 1e9);
    const avail = limit - start;
    const flex = KINDS[t.kind].flex;
    const minDur = flex ? Math.max(20, Math.round((baseDur * 0.8) / 5) * 5) : baseDur;
    let dur = baseDur, need = 0;
    if (avail >= baseDur) { /* 完整排入 */ }
    else if (flex && avail >= minDur) dur = avail;
    else if (!flex && avail + pool >= baseDur) need = baseDur - avail; // 縮短前面彈性任務換取空間
    else continue;
    const c = { place: p, walkIn, walkOut, arrive, queue, start, dur, minDur, need, pct, src: cr, moveBuf, sticky: sl.loc === p.id };
    c.score = score(ctx.mode, t.kind, p, c);
    out.push(c);
  }
  return out.sort((a, b) => a.score - b.score);
}

// 在同一空堂內縮短前面的彈性任務 x 分鐘，後面的任務跟著提前
// 有時段限制的任務（含用餐時段）不能被往前挪：只縮短它之後的彈性任務
function shrink(sl, slotItems, x) {
  let left = x;
  const anchored = (it) => !!(it.task.window || KINDS[it.task.kind].window);
  let from = 0;
  slotItems.forEach((it, j) => { if (anchored(it)) from = j + 1; });
  for (let j = from; j < slotItems.length && left > 0; j++) {
    const it = slotItems[j];
    if (!KINDS[it.task.kind].flex) continue;
    const cut = Math.min(left, it.dur - it.minDur);
    if (cut <= 0) continue;
    it.dur -= cut; it.end -= cut; it.shrunk = (it.shrunk || 0) + cut;
    for (let k = j + 1; k < slotItems.length; k++) {
      const o = slotItems[k];
      o.start -= cut; o.end -= cut; o.depart -= cut; o.arrive -= cut;
    }
    sl.cur -= cut;
    left -= cut;
  }
}

// 說明某任務為什麼排不進去（明確原因）
function whyNot(t, slots, ctx) {
  if (!slots.length) return '規劃時段內沒有空堂';
  if (t.place && isClosed(PLACES[t.place], ctx.day)) return `你指定的${PLACES[t.place].short}這天沒有營業`;
  const win = t.window || KINDS[t.kind].window;
  if (win && !slots.some((s) => s.e > win[0] && s.s < win[1])) return `${fmt(win[0])}–${fmt(win[1])} 之間沒有空堂（有課）`;
  if (t.deadline != null && t.deadline <= slots[0].s) return `截止時間 ${fmt(t.deadline)} 早於第一個空堂（${fmt(slots[0].s)}）`;
  const usable = slots.map((s) => Math.min(s.e, t.deadline ?? s.e) - s.s).filter((x) => x > 0);
  const longest = usable.length ? Math.max(...usable) : 0;
  if (longest < t.dur) return `最長可用空堂只有 ${longest} 分鐘，需要 ${t.dur} 分鐘`;
  if (t.place) return `指定的${PLACES[t.place].short}扣掉步行、排隊與 ${ctx.buffer} 分鐘緩衝後放不下；可改地點或調整時間`;
  return `扣掉步行、排隊與 ${ctx.buffer} 分鐘緩衝後，剩下的空堂放不下（已被其他任務佔用）`;
}

// ctx: {courses, day, win:{start,end}, tasks, order, overrides, scale, deferred, mode, buffer?, origin?, crowd?}
export function buildPlan(c) {
  const ctx = { buffer: 5, overrides: {}, scale: {}, deferred: [], mode: 'crowd', crowd: defaultCrowdFn(), ...c };
  ctx.buffer = Math.max(0, Number(ctx.buffer) || 0);
  // 任務指定的時段若超出規劃範圍，自動延長（例如晚上 6–9 點讀書）
  const tw = (ctx.tasks || []).filter((t) => !ctx.deferred.includes(t.id));
  const ws = Math.min(ctx.win.start, ...tw.filter((t) => t.userWindow && t.window).map((t) => t.window[0]));
  const we = Math.max(ctx.win.end, ...tw.filter((t) => t.userWindow || t.deadline != null).map((t) => (t.userWindow && t.window ? t.window[1] : t.deadline)));
  ctx.win = { start: ws, end: Math.min(1440, we) };
  const slots = computeSlots(ctx.courses, ctx.day, ctx.win, ctx.origin || null).map((s) => ({ ...s, cur: s.s, loc: s.prev, items: [] }));
  const baseSlots = slots.map((s) => ({ s: s.s, e: s.e }));
  const ordered = ctx.order.map((id) => ctx.tasks.find((t) => t.id === id)).filter((t) => t && !ctx.deferred.includes(t.id));
  const items = [], unscheduled = [], warnings = [];
  let si = 0;
  for (const t of ordered) {
    const want = Math.max(10, Math.round((t.dur * (ctx.scale[t.id] ?? 1)) / 5) * 5);
    let hit = null;
    for (let k = t.userWindow ? 0 : si; k < slots.length && !hit; k++) {
      const cands = evaluate(t, slots[k], want, ctx, slots[k].items);
      if (!cands.length) continue;
      let pick = cands[0];
      const ov = ctx.overrides[t.id];
      if (ov) { const f = cands.find((x) => x.place.id === ov); if (f) pick = f; }
      hit = { k, pick, cands };
    }
    if (!hit) { unscheduled.push({ task: t, reason: whyNot(t, baseSlots, ctx) }); continue; }
    const sl = slots[hit.k];
    let { pick } = hit;
    if (pick.need > 0) {
      // 先試算：縮短前面的彈性任務後，必須真的放得下（不需再縮短）才套用，否則還原並改找下一個空堂
      const snap = { cur: sl.cur, items: sl.items.map((it) => ({ it, v: [it.dur, it.end, it.start, it.depart, it.arrive, it.shrunk] })) };
      shrink(sl, sl.items, pick.need);
      const fit = evaluate(t, sl, want, ctx, sl.items).filter((x) => x.need === 0);
      const again = fit.find((x) => x.place.id === pick.place.id) || fit[0];
      if (again) pick = again;
      else {
        sl.cur = snap.cur;
        for (const { it, v } of snap.items) [it.dur, it.end, it.start, it.depart, it.arrive, it.shrunk] = v;
        const rest = slots.slice(hit.k + 1).map((x, j) => ({ k: hit.k + 1 + j, c: evaluate(t, x, want, ctx, x.items).filter((y) => y.need === 0) })).find((x) => x.c.length);
        if (!rest) { unscheduled.push({ task: t, reason: whyNot(t, baseSlots, ctx) }); continue; }
        hit.k = rest.k; hit.cands = rest.c; pick = rest.c.find((x) => x.place.id === ctx.overrides[t.id]) || rest.c[0];
      }
    }
    const sl2 = slots[hit.k];
    const worst = [...hit.cands].sort((a, b) => b.pct - a.pct)[0];
    const item = {
      task: t, place: pick.place, slot: sl2, slotIndex: hit.k, from: sl2.loc, depart: sl2.cur + pick.moveBuf,
      walkIn: pick.walkIn, walkOut: pick.walkOut, arrive: pick.arrive, queue: pick.queue,
      start: pick.start, end: pick.start + pick.dur, dur: pick.dur, minDur: pick.minDur, want,
      pct: pick.pct, src: pick.src, shrunk: t.kind === 'meal' ? 0 : Math.max(0, want - pick.dur), worst,
      alts: hit.cands.map((x) => ({ id: x.place.id, name: x.place.name, pct: x.pct, walk: x.walkIn + x.walkOut, queue: x.queue, src: x.src, picked: x.place.id === pick.place.id })),
      deadlineSlack: t.deadline != null ? t.deadline - (pick.start + pick.dur) : null,
      slack: null,
    };
    sl2.cur = item.end; sl2.loc = pick.place.id; sl2.items.push(item); items.push(item);
    if (!t.userWindow) si = hit.k; // 後面的任務不能排到更早的空堂（指定時段的任務除外）
  }
  // 每個空堂最後一項：計算回到下一堂課的緩衝
  for (const sl of slots) {
    sl.items.forEach((it, j) => { it.isLast = j === sl.items.length - 1; });
    const last = sl.items[sl.items.length - 1];
    if (last && sl.hasNext) last.slack = sl.e - (last.end + last.walkOut) - ctx.buffer;
  }
  // 縮短會讓前面任務提早結束：最後統一重算截止餘裕，避免顯示過期數字
  for (const it of items) if (it.task.deadline != null) it.deadlineSlack = it.task.deadline - it.end;
  // ── 警示 ──
  const freeMin = slots.reduce((a, s) => a + (s.e - s.s), 0);
  const needMin = ordered.reduce((a, t) => a + Math.round(t.dur * (ctx.scale[t.id] ?? 1)), 0);
  for (const u of unscheduled) warnings.push({ level: 'bad', text: `「${KINDS[u.task.kind].label}」（${u.task.dur} 分）排不進去：${u.reason}` });
  if (unscheduled.length && needMin > freeMin) warnings.push({ level: 'bad', text: `任務共需約 ${needMin} 分鐘，但可用空堂只有 ${freeMin} 分鐘` });
  for (const it of items) {
    const name = KINDS[it.task.kind].label;
    if (it.slack != null && it.slack < 8) warnings.push({ level: it.slack < 3 ? 'bad' : 'warn', text: `「${name}」後只剩 ${Math.max(it.slack, 0)} 分鐘緩衝，可能趕不上${it.slot.nextName || '下一堂課'}` });
    if (it.pct >= 80 && it.task.kind === 'meal') warnings.push({ level: 'warn', text: `${it.place.short} 人潮 ${it.pct}%、預估排隊 ${it.queue} 分鐘（${SOURCE_LABEL[it.src.source]}）` });
    if (it.shrunk > 10) warnings.push({ level: 'warn', text: `「${name}」被壓縮 ${it.shrunk} 分鐘才排得進去` });
  }
  const level = warnings.some((w) => w.level === 'bad') ? 'bad' : warnings.length ? 'warn' : 'ok';
  // 步行分兩部分：任務之間的移動（每項 walkIn）＋每個空堂最後一項回到下一堂課（walkOut），不重複計算
  const moveWalk = items.reduce((a, i) => a + i.walkIn, 0);
  const toClassWalk = items.reduce((a, i) => a + (i.isLast && i.slot.hasNext ? i.walkOut : 0), 0);
  const totalWalk = moveWalk + toClassWalk;
  const savedQueue = items.reduce((a, i) => a + Math.max(0, (i.worst?.queue || 0) - i.queue), 0);
  return { slots, items, unscheduled, warnings, level, totalWalk, moveWalk, toClassWalk, savedQueue, freeMin, needMin, win: ctx.win };
}

// ── AI 一鍵重新調配：枚舉任務順序，必要時壓縮彈性任務或延後 ──
function perms(a) {
  if (a.length <= 1) return [a];
  const out = [];
  a.forEach((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).forEach((p) => out.push([x, ...p])));
  return out;
}
const cost = (p, idx) =>
  p.unscheduled.length * 1000 + p.warnings.filter((w) => w.level === 'bad').length * 200 + p.warnings.length * 30 +
  p.items.reduce((a, i) => a + i.shrunk * 3 + i.pct * 0.2, 0) + p.totalWalk + idx * 0.001;

export function reallocate(c) {
  const ids = c.order.slice();
  const flexScale = (s) => Object.fromEntries(c.tasks.filter((t) => KINDS[t.kind].flex).map((t) => [t.id, s]));
  const dl = (id) => c.tasks.find((t) => t.id === id)?.deadline ?? 1e9;
  // ≤ 6 項：窮舉所有順序（最多 720 種）；> 6 項：以「截止時間優先」為起點，做兩兩交換的局部搜尋（上限 60 輪），避免階乘爆炸
  const attempt = (scale, deferred = []) => {
    const run = (order, idx) => { const p = buildPlan({ ...c, order, overrides: {}, scale, deferred }); return { k: cost(p, idx), order, plan: p }; };
    if (ids.length <= 6) return { ...perms(ids).map(run).reduce((a, b) => (b.k < a.k ? b : a)), scale, deferred };
    let best = [ids, [...ids].sort((a, b) => dl(a) - dl(b))].map(run).reduce((a, b) => (b.k < a.k ? b : a));
    for (let round = 0, improved = true; improved && round < 60; round++) {
      improved = false;
      for (let i = 0; i < ids.length && !improved; i++) for (let j = i + 1; j < ids.length && !improved; j++) {
        const o = best.order.slice(); [o[i], o[j]] = [o[j], o[i]];
        const r = run(o, 0); if (r.k < best.k - 1e-6) { best = r; improved = true; }
      }
    }
    return { ...best, scale, deferred };
  };
  let r = attempt({});
  if (r.plan.unscheduled.length) r = attempt(flexScale(0.75));
  if (r.plan.unscheduled.length) r = attempt(flexScale(0.75), r.plan.unscheduled.map((u) => u.task.id));
  return { order: r.order, overrides: {}, scale: r.scale, deferred: r.deferred };
}

// ── 推薦理由（Explainable）──
export function explain(it) {
  const t = it.task, p = it.place, out = [];
  const fromName = it.from ? placeName(it.from) : '目前位置';
  const srcTag = SOURCE_LABEL[it.src?.source] || '模擬';
  const wsrc = (x, y) => (walkSource(x, y) === 'gmaps' ? 'Google 地圖' : '預估');
  const walkTxt = it.from === p.id ? '同一地點，不用移動（步行約 0 分）' : `從${fromName}步行約 ${it.walkIn} 分（${wsrc(it.from, p.id)}）`;
  if (t.kind === 'meal') {
    out.push(`人潮約 ${approx(it.pct)}%（${srcTag}）｜${it.queue ? `估計排隊約 ${it.queue} 分` : '預期不需排隊'}｜${walkTxt}${it.isLast && it.slot.hasNext ? `、之後前往${BUILDINGS[it.slot.next] || '下一堂課教室（未填，預設估計）'}約 ${it.walkOut} 分（${wsrc(p.id, it.slot.next)}）` : ''}`);
    const w = it.worst;
    if (w && w.place?.id !== p.id && w.pct >= 70) out.push(`避開 ${w.place?.name || '擁擠地點'}：同時段人潮約 ${approx(w.pct)}%（${SOURCE_LABEL[w.src?.source] || '模擬'}）、估計排隊約 ${w.queue} 分，可能壓縮到${it.slot.nextName ? '「' + it.slot.nextName + '」' : '下一堂課'}的準備時間`);
    if (p.takeaway) out.push('外帶可縮短用餐時間，把空檔留給下一件事');
    if (it.slack != null) out.push(`預留 ${it.slack} 分鐘緩衝，確保準時到${BUILDINGS[it.slot.next] || '下一堂課'}`);
  } else if (t.kind === 'study' || t.kind === 'homework' || t.kind === 'group') {
    if (p.id === 'self') out.push('地點由你自選，系統沒有這裡的人潮與步行資料，只負責安排時間');
    else out.push(`空位率約 ${approx(100 - it.pct)}%（${srcTag}）｜安靜程度 ${p.quiet}/5（團隊假設，未實測）｜${walkTxt}`);
    if (it.dur >= 50 && t.kind !== 'group') out.push('專注模式：25 分鐘專注 + 5 分鐘休息，重複兩輪');
  } else if (p.nodata) {
    out.push(`沒有這裡的人潮資料，只安排時間｜${walkTxt}`);
  } else {
    out.push(`人潮約 ${approx(it.pct)}%（${srcTag}）｜${walkTxt}`);
  }
  if (t.place) out.push(`你指定的地點：${p.name}`);
  if (t.userWindow && t.window) out.push(`排在你指定的 ${fmt(t.window[0])}–${fmt(t.window[1])} 時段內`);
  if (p.unverified) out.push(`待確認：${p.unverified}`);
  if (it.src?.note) out.push(`資料說明：${it.src.note}`);
  if (t.deadline != null) out.push(it.deadlineSlack === 0 ? `剛好在 ${fmt(t.deadline)} 前完成（無額外緩衝）` : `預計 ${fmt(it.end)} 完成，距 ${fmt(t.deadline)} 截止還有 ${it.deadlineSlack} 分`);
  if (it.shrunk > 0) out.push(`彈性縮短 ${it.shrunk} 分鐘（步行時間佔用空堂），仍保留 ${it.dur} 分鐘`);
  return out;
}

export { toMin, fmt };
