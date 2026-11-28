// 規劃頁：需求輸入 + 偏好 + 智慧時間軸（規則式排程，可解釋）
import { DAYS, esc, fmt, toMin } from '../util.js';
import { ic } from '../icons.js';
import { BUILDINGS, KINDS, PLACES, PROVENANCE, placeName, placeShort, originGroups } from '../data/places.js';
import { DEMO_TEXT } from '../data/demo.js';
import { buildPlan, reallocate, explain } from '../engine/scheduler.js';
import { defaultCrowdFn, crowdText, SOURCE_LABEL } from '../engine/crowd.js';
import { taskState, demoState, sanitizeTask } from '../store.js';

const MODES = [['crowd', 'leaf', '避開人潮'], ['walk', 'walk', '最短步行'], ['focus', 'target', '專注效率']];
const OVERLOAD = '再幫我加一場兩小時的小組討論';
const HOUR = (m) => fmt(m);
let draft = null; // 尚未按「產生行程」的輸入文字：切換偏好、星期等設定時保留，不被清掉

export const planCtx = (ctx) => ({ courses: ctx.courses(), ...ctx.plan(), crowd: defaultCrowdFn(ctx.allObs(), ctx.plan().day) });
export const srcTag = (s) => `<i class="tag src-${s}">${SOURCE_LABEL[s] || '模擬'}</i>`;
const crowdCls = (p) => (p >= 80 ? 'hi' : p >= 60 ? 'mid' : '');

export function mapsUrl(fromId, toId) {
  const o = fromId ? placeName(fromId) : '總圖書館';
  return `https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=${encodeURIComponent('國立中央大學 ' + o)}&destination=${encodeURIComponent('國立中央大學 ' + placeName(toId))}`;
}

export function renderPlan(ctx) {
  const { state } = ctx, pl = ctx.plan(), courses = ctx.courses();
  const plan = buildPlan(planCtx(ctx));
  const dayCourses = courses.filter((c) => +c.day === +pl.day).sort((a, b) => toMin(a.start) - toMin(b.start));
  const days = [...new Set([...courses.map((c) => +c.day), +pl.day])].sort();
  const doneN = plan.items.filter((i) => pl.done[i.task.id]).length;
  const timeOpts = (list, cur) => list.map((m) => `<option value="${m}" ${cur === m ? 'selected' : ''}>${HOUR(m)}</option>`).join('');
  const startList = [420, 480, 540, 600, 660, 720], endList = [1020, 1080, 1200, 1320];
  if (!startList.includes(pl.win.start)) startList.push(pl.win.start);
  if (!endList.includes(pl.win.end)) endList.push(pl.win.end);

  const panel = `<aside id="panel" class="panel card stack">
    <div class="chips" role="group" aria-label="選擇星期">${days.map((d) => `<button data-day="${d}" aria-pressed="${d === +pl.day}">週${DAYS[d]}</button>`).join('')}</div>
    <div>${dayCourses.length ? dayCourses.map((c) => `<div class="li"><div class="bar" style="background:var(--c${c.color},#2f6fed)"></div><div class="li-main"><b>${esc(c.name)}</b><small>${esc(c.start)}–${esc(c.end)}${c.building ? ' · ' + esc(BUILDINGS[c.building]) : ''}</small></div></div>`).join('') : '<p class="note">這天沒有課程，整天都是空堂。</p>'}</div>
    <div><p class="note" style="margin-bottom:6px">空堂（規劃時段內）</p><div class="slotchips">${plan.slots.map((s) => `<i class="chip">${fmt(s.s)}–${fmt(s.e)}</i>`).join('') || '<small>沒有空堂</small>'}</div></div>
    <label class="f"><span>今天想完成什麼？</span><textarea id="nlText" rows="3" maxlength="300" placeholder="例如：我想吃午餐、去圖書館讀書一小時，還要在五點前完成一份作業。">${esc(draft ?? pl.text)}</textarea>${draft != null && draft !== pl.text ? '<p class="note" style="margin-top:-6px">文字已修改，按「產生行程」才會更新。</p>' : ''}</label>
    <div class="seg" role="group" aria-label="排程偏好">${MODES.map(([id, icon, t]) => `<button data-mode="${id}" class="${pl.mode === id ? 'on' : ''}" aria-pressed="${pl.mode === id}">${ic(icon, 16)}${t}</button>`).join('')}</div>
    ${(pl.unknown || []).length ? `<div class="banner warn">${ic('warn', 18)}<div><b>這些內容看不懂，沒有排入：</b>${pl.unknown.map((u) => '「' + esc(u) + '」').join('、')}。請改寫（例如「讀書 1 小時」「三點前交報告」），或在下方手動新增任務。</div></div>` : ''}
    ${(pl.notes || []).length ? `<div class="banner info">${ic('info', 18)}<div>${pl.notes.map(esc).join('<br>')}</div></div>` : ''}
    <details ${pl.tasks.some((t) => t.manual) || (pl.unknown || []).length ? 'open' : ''}><summary>${ic('edit', 16)} 檢查與修改解析結果（${pl.tasks.length} 項）</summary>
      <div class="stack" style="margin-top:8px">${pl.tasks.map((t) => `<div class="card" style="padding:10px;box-shadow:none">
        <div class="two"><label class="f" style="margin-bottom:6px"><span>類型</span><select data-tk="${t.id}" data-f="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${t.kind === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
        <label class="f" style="margin-bottom:6px"><span>分鐘${t.durGuessed ? '<small>（預設）</small>' : ''}</span><input type="number" inputmode="numeric" min="10" max="240" step="5" value="${t.dur}" data-tk="${t.id}" data-f="dur"></label></div>
        <label class="f" style="margin-bottom:6px"><span>地點</span><select data-tk="${t.id}" data-f="place"><option value="">系統挑選</option>${Object.values(PLACES).filter((p) => p.kinds.includes(t.kind)).map((p) => `<option value="${p.id}" ${t.place === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <div class="two"><label class="f" style="margin-bottom:6px"><span>最早開始（選填）</span><input type="time" value="${t.userWindow && t.window ? fmt(t.window[0]) : ''}" data-tk="${t.id}" data-f="wstart"></label>
        <label class="f" style="margin-bottom:6px"><span>最晚結束（選填）</span><input type="time" value="${t.deadline != null ? fmt(t.deadline) : ''}" data-tk="${t.id}" data-f="deadline"></label></div>
        <div class="row"><span style="flex:1"></span>
        <button class="icon-btn danger" data-deltask="${t.id}" aria-label="刪除任務 ${esc(KINDS[t.kind].label)}" style="align-self:flex-end">${ic('trash', 16)}</button></div>
        ${t.text ? `<small>原文：${esc(t.text)}</small>` : '<small>手動新增</small>'}</div>`).join('') || '<p class="note">目前沒有任務。</p>'}
        <button class="btn sm outline" id="addTask">${ic('plus', 16)}手動新增任務</button></div></details>
    <div class="row"><button class="btn primary" id="replan">${ic('sparkles')} 產生行程</button><button class="btn outline" id="overload" title="壓力測試：塞入過多任務">${ic('plus')} 加一場兩小時討論</button></div>
    <details><summary>${ic('settings', 16)} 進階設定</summary>
      <div class="stack" style="margin-top:10px">
        <div class="two"><label class="f"><span>規劃開始</span><select id="winStart">${timeOpts(startList.sort((a, b) => a - b), pl.win.start)}</select></label><label class="f"><span>規劃結束</span><select id="winEnd">${timeOpts(endList.sort((a, b) => a - b), pl.win.end)}</select></label></div>
        <div class="two"><label class="f"><span>出發地點</span><select id="origin"><option value="" ${pl.origin ? '' : 'selected'}>未指定（依前一堂課）</option>${originGroups().map(([g, list]) => `<optgroup label="${g}">${list.map(([id, n]) => `<option value="${id}" ${pl.origin === id ? 'selected' : ''}>${esc(n)}</option>`).join('')}</optgroup>`).join('')}</select></label>
        <label class="f"><span>移動緩衝（分）</span><input id="buffer" type="number" inputmode="numeric" min="0" max="30" step="1" value="${pl.buffer}"></label></div>
        <p class="note">需求解析為規則式（支援「N 小時 / N 分鐘 / N 點前」），不是大型語言模型。</p>
      </div></details>
  </aside>`;

  const ext = plan.extendTo ? `<div class="banner warn" style="margin-top:10px">${ic('clock', 18)}<div style="flex:1">有 ${plan.extendTo.tasks.length} 項任務指定的時間（${plan.extendTo.tasks.map((id) => { const t = pl.tasks.find((x) => x.id === id); return t ? `${KINDS[t.kind].label} ${fmt(t.window[0])}–${fmt(t.window[1])}` : ''; }).join('、')}）超出目前規劃範圍 ${fmt(pl.win.start)}–${fmt(pl.win.end)}。要延長規劃時段嗎？
    <div class="row" style="margin-top:8px"><button class="btn sm primary" id="extendWin">延長到 ${fmt(plan.extendTo.start)}–${fmt(plan.extendTo.end)}</button><span class="note">不延長的話，這些任務不會排入</span></div></div></div>` : '';
  const [lvl, icon, title] = { ok: ['ok', 'ok', '行程順暢'], warn: ['warn', 'warn', '時間緊繃'], bad: ['bad', 'bad', '時間衝突'] }[plan.level];
  const status = `<section class="status ${lvl}" aria-live="polite">
    <div class="status-top"><div><b>${ic(icon, 18)}${title}</b><p>${plan.level === 'ok' ? '所有任務都排進空堂，並預留移動緩衝。' : esc(plan.warnings.map((w) => w.text).join('；'))}${pl.deferred.length ? `；已將 ${pl.deferred.length} 項建議延後到晚上或明天` : ''}</p></div>
    <button class="btn sm ${plan.level !== 'ok' ? 'primary' : 'outline'}" id="realloc">${ic('refresh', 16)}${plan.level !== 'ok' ? '一鍵重新調配' : '重新最佳化'}</button></div>
    <div class="kpi"><span>完成 <b>${doneN}/${plan.items.length}</b></span><span>步行約 <b>${plan.totalWalk} 分</b><small>（移動 ${plan.moveWalk}＋回課堂 ${plan.toClassWalk}，預估）</small></span><span>估計少排隊 <b>${plan.savedQueue} 分</b></span></div></section>${ext}`;

  const blocks = dayCourses.filter((c) => toMin(c.end) > pl.win.start && toMin(c.start) < pl.win.end).map((c) => ({ s: toMin(c.start), html: classBlock(c) }));
  plan.slots.forEach((sl, i) => blocks.push({ s: sl.s, html: slotBlock(sl, i, plan, pl) }));
  blocks.sort((a, b) => a.s - b.s);
  const unsched = plan.unscheduled.map(({ task: t, reason }) => `<article class="tcard bad"><div class="th"><span class="tk">${ic(KINDS[t.kind].icon, 16)}${KINDS[t.kind].label}</span><span class="tag bad">未排入</span></div><p class="why1">需 ${t.dur} 分鐘${t.deadline != null ? `，${fmt(t.deadline)} 前完成` : ''}。${esc(reason)}</p></article>`).join('');
  const deferred = pl.deferred.map((id) => pl.tasks.find((t) => t.id === id)).filter(Boolean).map((t) => `<article class="tcard defer"><div class="th"><span class="tk">${ic(KINDS[t.kind].icon, 16)}${KINDS[t.kind].label}</span><span class="tag">已延後</span></div><p class="why1">今天空堂不足，建議挪到晚上或明天。</p></article>`).join('');

  return `<div class="page-head"><span class="eyebrow">Planner</span><h1>智慧行程規劃</h1></div>
  ${state.demo ? `<div class="banner info" style="margin-bottom:12px">${ic('flask', 18)}<div style="flex:1"><b>示範課表：</b>這裡用的是示範課表與示範規劃，你自己的課表與規劃另外保存、不受影響。</div><button class="btn sm" id="exitDemoCourses">使用我的課表</button></div>` : ''}
  <div class="plan">${panel}<section class="results">${status}
    <div class="tl-head"><h2>週${DAYS[pl.day]} 時間軸</h2><details class="prov"><summary>${ic('info', 16)}數字皆為模擬／預估</summary><p>${esc(PROVENANCE)}</p><p>步行分鐘為人工預估，請以實際走路為準。松苑、第九餐廳暫停營業，已移除。</p></details></div>
    ${pl.tasks.length ? blocks.map((b) => b.html).join('') + unsched + deferred : '<div class="card empty">還沒有可解析的任務，請在左側輸入需求。</div>'}
    <a class="jump" href="#panel">${ic('edit', 16)}修改課表與需求</a></section></div>`;
}

const classBlock = (c) => `<div class="blk" style="border-left:4px solid var(--c${c.color},#2f6fed)"><time>${esc(c.start)}–${esc(c.end)}</time><span><b>${esc(c.name)}</b>${c.building ? `<small> · ${esc(BUILDINGS[c.building])}</small>` : ''}</span><i class="tag">上課</i></div>`;

function slotBlock(sl, i, plan, pl) {
  const items = plan.items.filter((it) => it.slotIndex === i);
  return `<div class="slot"><div class="slot-h"><b>空堂 ${fmt(sl.s)}–${fmt(sl.e)}</b><small>${sl.e - sl.s} 分鐘</small></div>${items.length ? items.map((it) => taskCard(it, pl)).join('') : '<p class="note">這段空堂沒有安排任務，可自由運用。</p>'}</div>`;
}

function taskCard(it, pl) {
  const t = it.task, k = KINDS[t.kind], done = !!pl.done[t.id], idx = pl.order.indexOf(t.id);
  const study = ['study', 'homework', 'group'].includes(t.kind);
  const pill = it.place.nodata ? '<i class="tag">無人潮資料</i>' : `<i class="pill ${crowdCls(it.pct)}">${crowdText(it.pct)}</i>${study ? `<i class="pill q">安靜 ${it.place.quiet}/5 <small>假設</small></i>` : ''}${it.queue ? `<i class="pill hi">估計排隊 ${it.queue} 分</i>` : ''}`;
  const reasons = explain(it);
  const main = ['避開', '彈性縮短', '剛好', '預計', '專注模式'].map((p) => reasons.find((r) => r.startsWith(p))).find(Boolean) || reasons[0];
  const rest = reasons.filter((r) => r !== main);
  const stay = it.from === it.place.id;
  const route = `${stay ? '' : esc(it.from ? placeShort(it.from) : '目前位置') + ` <i>→ 步行約${it.walkIn}分 →</i> `}<b>${esc(it.place.short)}</b>${stay ? ' <i>（不用移動）</i>' : ''}${it.isLast && it.slot.hasNext ? ` <i>→ 步行約${it.walkOut}分 →</i> ${esc(BUILDINGS[it.slot.next] || '下一堂課')}` : ''}`;
  const alts = it.alts.filter((a) => !a.picked);
  const tags = [srcTag(it.src.source)];
  if (it.place.unverified) tags.push('<i class="tag warn">地點待確認</i>');
  if (it.unconfirmed) tags.push('<i class="tag warn">營業時間未確認</i>');
  if (it.shrunk > 0) tags.push(`<i class="tag warn">彈性縮短 ${it.shrunk} 分</i>`);
  if (it.slack != null && it.slack < 8) tags.push(`<i class="tag warn">緩衝僅 ${Math.max(it.slack, 0)} 分</i>`);
  if (it.pct >= 80 && t.kind === 'meal') tags.push('<i class="tag bad">人潮擁擠</i>');
  return `<article class="tcard ${done ? 'done' : ''}">
    <div class="th"><span class="tk">${ic(k.icon, 16)}${k.label}</span><time>${fmt(it.start)}–${fmt(it.end)}</time></div>
    <h3>${esc(it.place.name)}</h3><div class="pills">${pill}${tags.join('')}</div>
    <p class="route">${route}</p>${stay && !it.queue && !(it.free >= 15) ? '' : `<p class="route"><i>${it.free >= 15 ? `${fmt(it.depart - it.free)}–${fmt(it.depart)} 自由時間（${it.free} 分），` : ''}${!stay ? '約 ' + fmt(it.depart) + ' 出發、' + fmt(it.arrive) + ' 抵達' : ''}${it.queue ? '，估計排隊約 ' + it.queue + ' 分後開始' : ''}</i></p>`}<p class="why1">${esc(main)}</p>
    <div class="row">
      <button class="btn sm ${done ? 'primary' : ''}" data-done="${t.id}" aria-pressed="${done}">${ic(done ? 'done' : 'square', 16)}${done ? '已完成' : '完成'}</button>
      ${alts.length ? `<button class="btn sm" data-alt="${t.id}">${ic('refresh', 16)}換地點</button>` : ''}
      ${it.place.id === 'self' ? '' : `<a class="btn sm outline" href="${mapsUrl(it.from, it.place.id)}" target="_blank" rel="noopener noreferrer">${ic('nav', 16)}步行導航</a>`}
    </div>
    <details class="more"><summary>${ic('info', 16)}理由、其他地點、順序</summary>
      ${rest.length ? `<ul class="why">${rest.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
      ${alts.map((a) => `<button class="altrow" data-pick="${t.id}:${a.id}"><span>${esc(a.name)}</span><small>${crowdText(a.pct)}${a.queue ? ' · 估計排隊 ' + a.queue + ' 分' : ''} · 步行約 ${a.walk} 分 · ${SOURCE_LABEL[a.src?.source] || '模擬'}</small></button>`).join('')}
      <div class="row" style="margin-top:8px"><button class="btn sm" data-move="${t.id}:-1" ${idx <= 0 ? 'disabled' : ''}>${ic('up', 16)}提早</button><button class="btn sm" data-move="${t.id}:1" ${idx >= pl.order.length - 1 ? 'disabled' : ''}>${ic('down', 16)}延後</button></div>
    </details></article>`;
}

export function bindPlan(ctx) {
  const { state } = ctx, pl = ctx.plan(), $ = (s) => document.querySelector(s);
  const commit = () => { ctx.save(); ctx.rerender(); };
  const on = (sel, fn) => document.querySelectorAll(sel).forEach((el) => (el.onclick = () => fn(el)));
  const replan = (text) => { draft = null; Object.assign(pl, { text }, taskState(text)); commit(); };
  $('#nlText').oninput = (e) => { draft = e.target.value; };
  $('#replan').onclick = () => replan($('#nlText').value.trim().slice(0, 300));
  $('#overload').onclick = () => replan((($('#nlText').value.trim() || DEMO_TEXT).replace(/[。.]$/, '') + '，' + OVERLOAD + '。').slice(0, 300));
  const setWin = (k, v) => { const w = { ...pl.win, [k]: +v }; if (w.start >= w.end) return ctx.toast('開始時間必須早於結束時間', 'bad'); pl.win = w; pl.overrides = {}; commit(); };
  $('#winStart').onchange = (e) => setWin('start', e.target.value);
  $('#winEnd').onchange = (e) => setWin('end', e.target.value);
  $('#origin').onchange = (e) => { pl.origin = e.target.value; pl.overrides = {}; commit(); };
  $('#buffer').onchange = (e) => { const v = Math.round(+e.target.value); if (!(v >= 0 && v <= 30)) { ctx.toast('緩衝請輸入 0–30 分鐘', 'bad'); return ctx.rerender(); } pl.buffer = v; commit(); };
  on('[data-day]', (b) => { pl.day = +b.dataset.day; pl.overrides = {}; commit(); });
  on('[data-mode]', (b) => { pl.mode = b.dataset.mode; pl.overrides = {}; commit(); });
  on('[data-done]', (b) => { pl.done[b.dataset.done] = !pl.done[b.dataset.done]; commit(); });
  on('[data-alt]', (b) => {
    const id = b.dataset.alt, it = buildPlan(planCtx(ctx)).items.find((x) => x.task.id === id);
    if (!it) return;
    const ids = it.alts.map((a) => a.id); pl.overrides[id] = ids[(ids.indexOf(it.place.id) + 1) % ids.length]; commit();
  });
  on('[data-pick]', (b) => { const [id, place] = b.dataset.pick.split(':'); pl.overrides[id] = place; commit(); });
  on('[data-move]', (b) => {
    const [id, d] = b.dataset.move.split(':'), i = pl.order.indexOf(id), j = i + +d;
    if (j < 0 || j >= pl.order.length) return;
    [pl.order[i], pl.order[j]] = [pl.order[j], pl.order[i]]; pl.overrides = {}; commit();
  });
  // 手動修改任務：改動後清除與該任務相關的調整，標記為手動
  const editTask = (id, fn) => {
    const i = pl.tasks.findIndex((t) => t.id === id); if (i < 0) return;
    const t = sanitizeTask({ ...fn({ ...pl.tasks[i] }), manual: true });
    if (!t) { ctx.toast('任務內容不正確（時間需 10–240 分鐘）', 'bad'); return ctx.rerender(); }
    if (t.kind !== pl.tasks[i].kind) { delete t.place; if (!t.userWindow) delete t.window; if (t.kind === 'meal' && /晚餐|晚飯/.test(t.text)) t.window = [1020, 1200]; }
    pl.tasks[i] = t; delete pl.overrides[id]; delete pl.scale[id]; pl.deferred = pl.deferred.filter((x) => x !== id); commit();
  };
  document.querySelectorAll('[data-tk]').forEach((el) => (el.onchange = () => editTask(el.dataset.tk, (t) => {
    if (el.dataset.f === 'kind') t.kind = el.value;
    if (el.dataset.f === 'dur') { t.dur = Math.round(+el.value / 5) * 5 || +el.value; t.durGuessed = false; }
    if (el.dataset.f === 'deadline') {
      if (el.value) t.deadline = toMin(el.value); else delete t.deadline;
      if (t.userWindow && t.window) { if (t.deadline != null) t.window = [t.window[0], t.deadline]; else { delete t.window; delete t.userWindow; } }
    }
    if (el.dataset.f === 'wstart') {
      if (el.value) { t.window = [toMin(el.value), t.deadline ?? 1320]; t.userWindow = true; }
      else if (t.userWindow) { delete t.window; delete t.userWindow; }
    }
    if (el.dataset.f === 'place') { if (el.value) t.place = el.value; else delete t.place; }
    return t;
  })));
  on('[data-deltask]', (b) => { const id = b.dataset.deltask; pl.tasks = pl.tasks.filter((t) => t.id !== id); pl.order = pl.order.filter((x) => x !== id); pl.deferred = pl.deferred.filter((x) => x !== id); delete pl.overrides[id]; delete pl.done[id]; commit(); });
  $('#addTask').onclick = () => {
    if (pl.tasks.length >= 20) return ctx.toast('最多 20 項任務', 'bad');
    const id = 'm' + Date.now().toString(36);
    pl.tasks.push({ id, kind: 'study', dur: 60, text: '', manual: true }); pl.order.push(id); commit();
  };
  const ex = $('#extendWin'); if (ex) ex.onclick = () => { const p = buildPlan(planCtx(ctx)).extendTo; if (p) { pl.win = { start: p.start, end: p.end }; pl.overrides = {}; commit(); ctx.toast(`規劃時段已延長為 ${fmt(p.start)}–${fmt(p.end)}`, 'ok'); } };
  const xd = $('#exitDemoCourses'); if (xd) xd.onclick = () => ctx.setDemoCourses(false);
  const r = $('#realloc');
  if (r) r.onclick = () => { Object.assign(pl, reallocate(planCtx(ctx))); commit(); };
}
export { demoState };
