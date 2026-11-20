// 規則式排程引擎（非機器學習）：解析需求 → 算空堂 → 依偏好挑地點 → 衝突偵測 → 一鍵重新調配
import { PLACES, KINDS, BUILDINGS, walk, placeName } from './data.js';

export const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
export const fmt = (n) => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(Math.round(n % 60)).padStart(2, '0');

// ── 模擬人潮模型 ──
// 下課尖峰係數：11:30 起升高，12:00–12:30 最高，之後緩降
const lunchPeak = (t) =>
  t < 690 ? 0.25 : t < 720 ? 0.25 + (0.75 * (t - 690)) / 30 : t < 750 ? 1 : t < 810 ? 1 - (0.7 * (t - 750)) / 60 : 0.3;

export const vacancy = (p, t) => Math.max(10, Math.round(p.vac - 3 * Math.max(0, t / 60 - 15)));
export const crowdPct = (p, t) =>
  p.vac != null ? 100 - vacancy(p, t) : Math.round(p.base + p.peak * lunchPeak(t));
export const queueMin = (pct) => (pct >= 70 ? Math.round((pct - 68) * 0.75) : 0);

// ── 自然語言需求解析 ──
const CN = { 零: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const num = (s) => (/^\d+(\.\d+)?$/.test(s) ? +s : s.length === 1 ? CN[s] ?? null : s === '十一' ? 11 : s === '十二' ? 12 : null);
const NUM = '(\\d+(?:\\.\\d+)?|[一二兩三四五六七八九十]+)';

export function parseTasks(text) {
  const segs = text.split(/[，,。；;、\n！!？?]|還要|還有|然後|以及/).map((s) => s.trim()).filter(Boolean);
  const tasks = [];
  for (const seg of segs) {
    let kind = null;
    if (/午餐|午飯|吃飯|用餐|晚餐|晚飯|吃/.test(seg)) kind = 'meal';
    else if (/作業|報告|專題|論文|週報/.test(seg)) kind = 'homework';
    else if (/討論|小組|開會/.test(seg)) kind = 'group';
    else if (/圖書館|讀書|自習|K書|念書|複習|預習/.test(seg)) kind = 'study';
    else if (/行政|辦事|影印|繳|註冊/.test(seg)) kind = 'errand';
    if (!kind) continue;
    let dur = KINDS[kind].dur;
    let m;
    if (/半小時/.test(seg)) dur = 30;
    else if ((m = seg.match(new RegExp(NUM + '\\s*個?\\s*小時(半)?'))) && num(m[1]) != null) dur = Math.round(num(m[1]) * 60) + (m[2] ? 30 : 0);
    else if ((m = seg.match(new RegExp(NUM + '\\s*分鐘?'))) && num(m[1]) != null) dur = Math.round(num(m[1]));
    dur = Math.max(10, Math.min(240, dur));
    const task = { id: kind + tasks.length, kind, dur, text: seg };
    if ((m = seg.match(new RegExp(NUM + '\\s*[點時:]\\s*(半)?\\s*前'))) && num(m[1]) != null) {
      let h = num(m[1]);
      if (h <= 7) h += 12;
      task.deadline = h * 60 + (m[2] ? 30 : 0);
    }
    if (kind === 'meal' && /晚餐|晚飯/.test(seg)) task.window = [1020, 1200];
    tasks.push(task);
  }
  return tasks;
}

// ── 空堂計算（含前後課堂所在建築）──
export function computeSlots(courses, day, win) {
  const cs = courses
    .filter((c) => +c.day === +day)
    .map((c) => ({ ...c, s: toMin(c.start), e: toMin(c.end) }))
    .sort((a, b) => a.s - b.s);
  const slots = [];
  let cur = win.start, prev = null;
  for (const c of cs) {
    if (c.e <= win.start) { prev = c.building || null; continue; }
    if (c.s >= win.end) break;
    if (c.s > cur) slots.push({ s: cur, e: Math.min(c.s, win.end), prev, next: c.building || null, nextName: c.name, nextStart: c.s });
    cur = Math.max(cur, c.e);
    prev = c.building || null;
  }
  if (cur < win.end) slots.push({ s: cur, e: win.end, prev, next: null });
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

function evaluate(t, sl, want, mode, slotItems) {
  const pool = slotItems.reduce((a, it) => a + (KINDS[it.task.kind].flex ? it.dur - it.minDur : 0), 0);
  const out = [];
  for (const p of Object.values(PLACES)) {
    if (!p.kinds.includes(t.kind)) continue;
    const walkIn = walk(sl.loc, p.id);
    const arrive = sl.cur + walkIn;
    const win = t.window || KINDS[t.kind].window;
    if (win && arrive > win[1]) continue;
    let start = arrive;
    if (win && start < win[0]) start = win[0];
    const pct = crowdPct(p, arrive);
    const queue = t.kind === 'meal' || t.kind === 'errand' ? queueMin(pct) : 0;
    start += queue;
    const baseDur = t.kind === 'meal' ? p.eat ?? want : want;
    const walkOut = sl.next ? walk(p.id, sl.next) : 0;
    const limit = Math.min(sl.e - walkOut, t.deadline ?? 1e9);
    const avail = limit - start;
    const flex = KINDS[t.kind].flex;
    const minDur = flex ? Math.max(20, Math.round((baseDur * 0.8) / 5) * 5) : baseDur;
    let dur = baseDur, need = 0;
    if (avail >= baseDur) { /* 完整排入 */ }
    else if (flex && avail >= minDur) dur = avail;
    else if (!flex && avail + pool >= baseDur) need = baseDur - avail; // 縮短前面彈性任務換取空間
    else continue;
    const c = { place: p, walkIn, walkOut, arrive, queue, start, dur, minDur, need, pct, sticky: sl.loc === p.id };
    c.score = score(mode, t.kind, p, c);
    out.push(c);
  }
  return out.sort((a, b) => a.score - b.score);
}

// 在同一空堂內縮短前面的彈性任務 x 分鐘，後面的任務跟著提前
function shrink(sl, slotItems, x) {
  let left = x;
  for (let j = 0; j < slotItems.length && left > 0; j++) {
    const it = slotItems[j];
    if (!KINDS[it.task.kind].flex) continue;
    const cut = Math.min(left, it.dur - it.minDur);
    if (cut <= 0) continue;
    it.dur -= cut; it.end -= cut; it.shrunk = (it.shrunk || 0) + cut;
    for (let k = j + 1; k < slotItems.length; k++) { slotItems[k].start -= cut; slotItems[k].end -= cut; slotItems[k].depart -= cut; slotItems[k].arrive -= cut; }
    sl.cur -= cut;
    left -= cut;
  }
}

export function buildPlan(c) {
  const slots = computeSlots(c.courses, c.day, c.win).map((s) => ({ ...s, cur: s.s, loc: s.prev, items: [] }));
  const ordered = c.order.map((id) => c.tasks.find((t) => t.id === id)).filter((t) => t && !c.deferred.includes(t.id));
  const items = [], unscheduled = [], warnings = [];
  let si = 0;
  for (const t of ordered) {
    const want = Math.max(10, Math.round((t.dur * (c.scale[t.id] ?? 1)) / 5) * 5);
    let hit = null;
    for (let k = si; k < slots.length && !hit; k++) {
      const cands = evaluate(t, slots[k], want, c.mode, slots[k].items);
      if (!cands.length) continue;
      let pick = cands[0];
      const ov = c.overrides[t.id];
      if (ov) { const f = cands.find((x) => x.place.id === ov); if (f) pick = f; }
      hit = { k, pick, cands };
    }
    if (!hit) { unscheduled.push(t); continue; }
    const sl = slots[hit.k];
    let { pick } = hit;
    if (pick.need > 0) {
      shrink(sl, sl.items, pick.need);
      const again = evaluate(t, sl, want, c.mode, sl.items).find((x) => x.place.id === pick.place.id);
      if (again) pick = again;
    }
    const worst = [...hit.cands].sort((a, b) => b.pct - a.pct)[0];
    const item = {
      task: t, place: pick.place, slot: sl, slotIndex: hit.k, from: sl.loc, depart: sl.cur,
      walkIn: pick.walkIn, walkOut: pick.walkOut, arrive: pick.arrive, queue: pick.queue,
      start: pick.start, end: pick.start + pick.dur, dur: pick.dur, minDur: pick.minDur, want,
      pct: pick.pct, shrunk: t.kind === 'meal' ? 0 : Math.max(0, want - pick.dur), worst,
      alts: hit.cands.map((x) => ({ id: x.place.id, name: x.place.name, pct: x.pct, walk: x.walkIn + x.walkOut, queue: x.queue, picked: x.place.id === pick.place.id })),
      deadlineSlack: t.deadline != null ? t.deadline - (pick.start + pick.dur) : null,
      slack: null,
    };
    sl.cur = item.end; sl.loc = pick.place.id; sl.items.push(item); items.push(item);
    // 縮短發生在「後面任務要求」時，補記前面任務的縮短量（shrink 已寫入 it.shrunk）
  }
  // 每個空堂最後一項：計算回到下一堂課的緩衝
  for (const sl of slots) {
    const last = sl.items[sl.items.length - 1];
    if (last && sl.next) last.slack = sl.e - (last.end + last.walkOut);
  }
  // ── 警示 ──
  const freeMin = slots.reduce((a, s) => a + (s.e - s.s), 0);
  const needMin = ordered.reduce((a, t) => a + Math.round(t.dur * (c.scale[t.id] ?? 1)), 0);
  for (const t of unscheduled) warnings.push({ level: 'bad', text: `「${KINDS[t.kind].label}」（${t.dur} 分）排不進今天的空堂` });
  if (unscheduled.length && needMin > freeMin) warnings.push({ level: 'bad', text: `任務共需約 ${needMin} 分鐘，但可用空堂只有 ${freeMin} 分鐘` });
  for (const it of items) {
    const name = KINDS[it.task.kind].label;
    if (it.slack != null && it.slack < 8) warnings.push({ level: it.slack < 3 ? 'bad' : 'warn', text: `「${name}」後只剩 ${Math.max(it.slack, 0)} 分鐘緩衝，可能趕不上${it.slot.nextName || '下一堂課'}` });
    if (it.pct >= 80 && it.task.kind === 'meal') warnings.push({ level: 'warn', text: `${it.place.short} 人潮 ${it.pct}%、預估排隊 ${it.queue} 分鐘（模擬）` });
    if (it.shrunk > 10) warnings.push({ level: 'warn', text: `「${name}」被壓縮 ${it.shrunk} 分鐘才排得進去` });
  }
  const level = warnings.some((w) => w.level === 'bad') ? 'bad' : warnings.length ? 'warn' : 'ok';
  const totalWalk = items.reduce((a, i) => a + i.walkIn + i.walkOut, 0);
  const savedQueue = items.reduce((a, i) => a + Math.max(0, (i.worst?.queue || 0) - i.queue), 0);
  return { slots, items, unscheduled, warnings, level, totalWalk, savedQueue, freeMin, needMin };
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
  const orders = ids.length <= 6 ? perms(ids) : [ids];
  const flexScale = (s) => Object.fromEntries(c.tasks.filter((t) => KINDS[t.kind].flex).map((t) => [t.id, s]));
  const attempt = (scale, deferred = []) => {
    let best = null;
    orders.forEach((order, idx) => {
      const p = buildPlan({ ...c, order, overrides: {}, scale, deferred });
      const k = cost(p, idx);
      if (!best || k < best.k) best = { k, order, plan: p };
    });
    return { ...best, scale, deferred };
  };
  let r = attempt({});
  if (r.plan.unscheduled.length) r = attempt(flexScale(0.75));
  if (r.plan.unscheduled.length) r = attempt(flexScale(0.75), r.plan.unscheduled.map((t) => t.id));
  return { order: r.order, overrides: {}, scale: r.scale, deferred: r.deferred };
}

// ── 推薦理由（Explainable）──
export function explain(it) {
  const t = it.task, p = it.place, out = [];
  const fromName = it.from ? placeName(it.from) : '目前位置';
  if (t.kind === 'meal') {
    out.push(`人潮 ${it.pct}%（模擬）｜預估排隊 ${it.queue} 分｜從${fromName}步行 ${it.walkIn} 分${it.slot.next ? `、前往${BUILDINGS[it.slot.next]}僅 ${it.walkOut} 分` : ''}`);
    const w = it.worst;
    if (w && w.place.id !== p.id && w.pct >= 70) out.push(`避開 ${w.place.name}：下課尖峰 ${w.pct}% 擁擠、預估排隊 ${w.queue} 分，可能壓縮到${it.slot.nextName ? '「' + it.slot.nextName + '」' : '下一堂課'}的準備時間`);
    if (p.takeaway) out.push('外帶可縮短用餐時間，把空檔留給下一件事');
    if (it.slack != null) out.push(`預留 ${it.slack} 分鐘緩衝，確保準時到${BUILDINGS[it.slot.next] || '下一堂課'}`);
  } else if (t.kind === 'study' || t.kind === 'homework' || t.kind === 'group') {
    out.push(`空位率 ${100 - it.pct}%（模擬）｜安靜程度 ${p.quiet}/5｜距${it.from ? placeName(it.from) : '目前位置'}步行 ${it.walkIn} 分`);
    if (it.dur >= 50 && t.kind !== 'group') out.push('專注模式：25 分鐘專注 + 5 分鐘休息，重複兩輪');
    if (p.quiet <= 2) out.push('此處較吵雜，適合討論，不適合需要安靜的作業');
  } else {
    out.push(`人潮 ${it.pct}%（模擬）｜步行 ${it.walkIn} 分`);
  }
  if (t.deadline != null) out.push(it.deadlineSlack === 0 ? `剛好在 ${fmt(t.deadline)} 前完成（無額外緩衝）` : `預計 ${fmt(it.end)} 完成，距 ${fmt(t.deadline)} 截止還有 ${it.deadlineSlack} 分`);
  if (it.shrunk > 0) out.push(`彈性縮短 ${it.shrunk} 分鐘（步行時間佔用空堂），仍保留 ${it.dur} 分鐘`);
  return out;
}
