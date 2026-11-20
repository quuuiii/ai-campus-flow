// 主畫面：Demo 情境 + 需求輸入 + 偏好權重 + AI 智慧時間軸
import { DAYS, BUILDINGS, KINDS, PROVENANCE, DEMO_TEXT, demoCourses, placeName, placeShort } from './data.js';
import { parseTasks, computeSlots, buildPlan, reallocate, explain, fmt, toMin } from './engine.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MODES = [
  ['crowd', '🌿 避開人潮'],
  ['walk', '👟 最短步行'],
  ['focus', '🎯 專注效率'],
];
const OVERLOAD = '再幫我加一場兩小時的小組討論';

export function defaultPlan(courses) {
  const days = [...new Set(courses.map((c) => +c.day))];
  const today = new Date().getDay();
  const day = days.includes(today) ? today : days.sort()[0] ?? today;
  return { day, text: DEMO_TEXT, mode: 'crowd', win: { start: 540, end: 1020 }, ...taskState(DEMO_TEXT) };
}
const taskState = (text) => {
  const tasks = parseTasks(text);
  return { tasks, order: tasks.map((t) => t.id), overrides: {}, scale: {}, deferred: [], done: {} };
};
export const demoState = () => {
  const courses = demoCourses();
  return { courses, tab: 'home', plan: defaultPlan(courses) };
};

const ctxOf = (state) => ({ courses: state.courses, ...state.plan });

export function renderDashboard(state) {
  const pl = state.plan;
  const plan = buildPlan(ctxOf(state));
  const dayCourses = state.courses.filter((c) => +c.day === +pl.day).sort((a, b) => toMin(a.start) - toMin(b.start));
  const daysWith = [...new Set(state.courses.map((c) => +c.day))].sort();
  const doneN = plan.items.filter((i) => pl.done[i.task.id]).length;

  // ── 設定面板（單一卡片）──
  const panel = `
  <aside id="panel" class="panel">
    <div class="daychips">${(daysWith.length ? daysWith : [pl.day]).map((d) => `<button class="dchip ${d === +pl.day ? 'on' : ''}" data-day="${d}">週${DAYS[d]}</button>`).join('')}<button class="link" data-tab="schedule">編輯課表</button></div>
    <div class="courses">${dayCourses.length
      ? dayCourses.map((c) => `<div class="mini"><time>${esc(c.start)}–${esc(c.end)}</time><span>${esc(c.name)}${c.building ? `<small> · ${BUILDINGS[c.building] || ''}</small>` : ''}</span></div>`).join('')
      : '<p class="note">這天沒有課程，整天都是空堂。</p>'}
      <div class="mini"><time>空堂</time><span class="chips">${plan.slots.map((s) => `<i class="chip">${fmt(s.s)}–${fmt(s.e)}</i>`).join('') || '<small>規劃時段內沒有空堂</small>'}</span></div>
    </div>
    <label class="fl">今天想完成什麼？
      <textarea id="nlText" rows="3" placeholder="例如：我想吃午餐、去圖書館讀書一小時，還要在五點前完成一份作業。">${esc(pl.text)}</textarea>
    </label>
    <div class="seg">${MODES.map(([id, t]) => `<button class="${pl.mode === id ? 'on' : ''}" data-mode="${id}">${t}</button>`).join('')}</div>
    <div class="row"><button class="primary" id="replan">✦ 產生行程</button><button class="outline" id="overload" title="壓力測試：塞入過多任務，看系統如何偵測衝突">＋ 加碼測試</button></div>
    <details class="adv"><summary>進階</summary>
      <label class="fl">規劃到幾點<select id="winEnd">${[[1020, '17:00'], [1080, '18:00'], [1200, '20:00'], [1320, '22:00']].map(([v, t]) => `<option value="${v}" ${pl.win.end === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <p class="note">需求解析為規則式（支援「N 小時 / N 分鐘 / N 點前」），非大型語言模型。</p>
    </details>
  </aside>`;

  // ── 狀態列 ──
  const [lvl, title, body] = {
    ok: ['ok', '✅ 行程順暢', '所有任務都排進空堂，並預留移動緩衝'],
    warn: ['warn', '⚠️ 時間緊繃', plan.warnings.map((w) => esc(w.text)).join('；')],
    bad: ['bad', '⛔ 時間衝突', plan.warnings.map((w) => esc(w.text)).join('；')],
  }[plan.level];
  const statusHtml = `<section class="status ${lvl}">
    <div class="st-main"><b>${title}</b><span>${body}${pl.deferred.length ? `；已將 ${pl.deferred.length} 項建議延後到晚上或明天` : ''}</span></div>
    <div class="st-kpi"><span>完成 <b>${doneN}/${plan.items.length}</b></span><span>步行 <b>${plan.totalWalk} 分</b></span><span>少排隊 <b>${plan.savedQueue} 分</b></span></div>
    <button class="${plan.level !== 'ok' ? 'primary' : 'outline'}" id="realloc">✦ ${plan.level !== 'ok' ? 'AI 一鍵重新調配' : '重新最佳化'}</button>
  </section>`;

  // ── 時間軸 ──
  const blocks = [];
  for (const c of dayCourses) {
    const s = toMin(c.start), e = toMin(c.end);
    if (e > pl.win.start && s < pl.win.end) blocks.push({ s, kind: 'class', c });
  }
  plan.slots.forEach((sl, i) => blocks.push({ s: sl.s, kind: 'slot', sl, i }));
  blocks.sort((a, b) => a.s - b.s);
  const tl = blocks.map((b) => (b.kind === 'class' ? classBlock(b.c) : slotBlock(b.sl, b.i, plan, pl))).join('');
  const unsched = plan.unscheduled.map((t) => `<article class="tcard bad"><div class="th"><span class="tk">${KINDS[t.kind].icon} ${KINDS[t.kind].label}</span><span class="tag bad">未排入</span></div><p class="why1">需 ${t.dur} 分鐘${t.deadline != null ? `，${fmt(t.deadline)} 前完成` : ''}。空堂不足，請按「AI 一鍵重新調配」。</p></article>`).join('');
  const deferred = pl.deferred.map((id) => pl.tasks.find((t) => t.id === id)).filter(Boolean).map((t) => `<article class="tcard defer"><div class="th"><span class="tk">${KINDS[t.kind].icon} ${KINDS[t.kind].label}</span><span class="tag">已延後</span></div><p class="why1">今天空堂不足，建議挪到晚上或明天（${t.dur} 分鐘）。</p></article>`).join('');

  const results = `<section class="results">
    ${statusHtml}
    <div class="tl-head"><h2>週${DAYS[pl.day]} 智慧時間軸</h2><details class="prov"><summary>ⓘ 數字皆為模擬估算</summary><p>${esc(PROVENANCE)}</p><p>地點取自中央大學校園地圖；K書中心在中正圖書館 2F；松苑、第九餐廳暫停營業，已移除。</p></details></div>
    ${pl.tasks.length ? tl + unsched + deferred : '<section class="card">還沒有可解析的任務，請在下方輸入需求，或按「一鍵載入 Demo 情境」。</section>'}
    <a class="jump" href="#panel">✎ 修改課表與需求</a>
  </section>`;

  return `<section class="hero compact">
    <div><h1>Smart Campus, <em>Smarter Schedule.</em></h1><p>AI 個人化校園行程助手：依課表空堂、人潮與步行距離，排出你的一天，並說明每個決定。</p></div>
    <button class="primary big" id="loadDemo">⚡ 一鍵載入中大 Demo 情境</button>
  </section>
  <div class="dash">${panel}${results}</div>`;
}

function classBlock(c) {
  return `<div class="blk"><time>${esc(c.start)}–${esc(c.end)}</time><span><b>${esc(c.name)}</b>${c.building ? `<small> · ${BUILDINGS[c.building] || ''}</small>` : ''}</span><i class="tag">上課</i></div>`;
}

function slotBlock(sl, i, plan, pl) {
  const items = plan.items.filter((it) => it.slotIndex === i);
  return `<div class="slot"><div class="slot-h"><b>空堂 ${fmt(sl.s)}–${fmt(sl.e)}</b><small>${sl.e - sl.s} 分鐘</small></div>
  ${items.length ? items.map((it) => taskCard(it, pl, plan)).join('') : '<p class="note">這段空堂沒有安排任務，可自由運用。</p>'}</div>`;
}

const crowdCls = (p) => (p >= 80 ? 'hi' : p >= 60 ? 'mid' : 'lo');
function taskCard(it, pl) {
  const t = it.task, k = KINDS[t.kind], done = !!pl.done[t.id];
  const idx = pl.order.indexOf(t.id);
  const study = t.kind === 'study' || t.kind === 'homework' || t.kind === 'group';
  const pill = study
    ? `<i class="pill ${crowdCls(it.pct)}">空位 ${100 - it.pct}%</i><i class="pill q">安靜 ${it.place.quiet}/5</i>`
    : `<i class="pill ${crowdCls(it.pct)}">人潮 ${it.pct}%</i>${it.queue ? `<i class="pill hi">排隊 ${it.queue} 分</i>` : ''}`;
  const reasons = explain(it);
  const main = ['避開', '彈性縮短', '剛好', '預計', '專注模式'].map((k) => reasons.find((r) => r.startsWith(k))).find(Boolean) || reasons[0];
  const rest = reasons.filter((r) => r !== main);
  const stay = it.from === it.place.id;
  const route = `${stay ? '' : esc(it.from ? placeShort(it.from) : '目前位置') + ' <i>→ 🚶' + it.walkIn + '分 →</i> '}<b>${esc(it.place.short)}</b>${stay ? ' <i>（不用移動）</i>' : ''}${it.slot.next ? ` <i>→ 🚶${it.walkOut}分 →</i> ${esc(BUILDINGS[it.slot.next])}` : ''}`;
  const maps = `https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=${encodeURIComponent('國立中央大學 ' + (it.from ? placeName(it.from) : '總圖書館'))}&destination=${encodeURIComponent('國立中央大學 ' + it.place.name)}`;
  const alts = it.alts.filter((a) => !a.picked);
  const tags = [];
  if (it.shrunk > 0) tags.push(`<i class="tag warn">彈性縮短 ${it.shrunk} 分</i>`);
  if (it.slack != null && it.slack < 8) tags.push(`<i class="tag warn">緩衝僅 ${Math.max(it.slack, 0)} 分</i>`);
  if (it.pct >= 80 && t.kind === 'meal') tags.push('<i class="tag bad">人潮擁擠</i>');
  return `<article class="tcard ${done ? 'done' : ''}">
    <div class="th"><span class="tk">${k.icon} ${k.label}</span><time>${fmt(it.start)}–${fmt(it.end)}</time></div>
    <h3>${esc(it.place.name)}</h3>
    <div class="pills">${pill}${tags.join('')}</div>
    <p class="route">${route}</p>
    <p class="why1">${esc(main)}</p>
    <div class="acts">
      <button class="chk ${done ? 'on' : ''}" data-done="${t.id}">${done ? '☑ 已完成' : '☐ 完成'}</button>
      ${alts.length ? `<button data-alt="${t.id}">⟳ 換個地點</button>` : ''}
    </div>
    <details class="more"><summary>更多：理由、其他地點、順序</summary>
      ${rest.length ? `<ul class="why">${rest.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
      ${alts.length ? `<div class="alts">${alts.map((a) => `<button class="altrow" data-pick="${t.id}:${a.id}"><span>${esc(a.name)}</span><small>${study ? '空位 ' + (100 - a.pct) + '%' : '人潮 ' + a.pct + '%' + (a.queue ? ' · 排隊 ' + a.queue + ' 分' : '')} · 步行 ${a.walk} 分</small></button>`).join('')}</div>` : ''}
      <div class="acts"><button data-move="${t.id}:-1" ${idx <= 0 ? 'disabled' : ''}>↑ 提早</button><button data-move="${t.id}:1" ${idx >= pl.order.length - 1 ? 'disabled' : ''}>↓ 延後</button><a href="${maps}" target="_blank" rel="noopener noreferrer">Google 地圖路線 ↗</a></div>
    </details>
  </article>`;
}

export function bindDashboard(state, { save, rerender }) {
  const $ = (s) => document.querySelector(s);
  const pl = state.plan;
  const commit = () => { save(); rerender(); };
  const on = (sel, fn) => document.querySelectorAll(sel).forEach((el) => (el.onclick = () => fn(el)));
  const replan = (text) => { Object.assign(pl, { text }, taskState(text)); commit(); };

  $('#loadDemo').onclick = () => { Object.assign(state, demoState(), { tab: 'home' }); commit(); };
  $('#replan').onclick = () => replan($('#nlText').value.trim().slice(0, 300));
  $('#overload').onclick = () => replan((($('#nlText').value.trim() || DEMO_TEXT).replace(/[。.]$/, '') + '，' + OVERLOAD + '。').slice(0, 300));
  $('#winEnd').onchange = (e) => { pl.win.end = +e.target.value; pl.overrides = {}; commit(); };
  on('[data-day]', (b) => { pl.day = +b.dataset.day; pl.overrides = {}; commit(); });
  on('[data-mode]', (b) => { pl.mode = b.dataset.mode; pl.overrides = {}; commit(); });
  on('[data-done]', (b) => { pl.done[b.dataset.done] = !pl.done[b.dataset.done]; commit(); });
  on('[data-alt]', (b) => {
    const id = b.dataset.alt, plan = buildPlan(ctxOf(state)), it = plan.items.find((x) => x.task.id === id);
    if (!it) return;
    const ids = it.alts.map((a) => a.id), next = ids[(ids.indexOf(it.place.id) + 1) % ids.length];
    pl.overrides[id] = next; commit();
  });
  on('[data-pick]', (b) => { const [id, place] = b.dataset.pick.split(':'); pl.overrides[id] = place; commit(); });
  on('[data-move]', (b) => {
    const [id, d] = b.dataset.move.split(':'), i = pl.order.indexOf(id), j = i + +d;
    if (j < 0 || j >= pl.order.length) return;
    [pl.order[i], pl.order[j]] = [pl.order[j], pl.order[i]]; pl.overrides = {}; commit();
  });
  const realloc = $('#realloc');
  if (realloc) realloc.onclick = () => { Object.assign(pl, reallocate(ctxOf(state))); commit(); };
}
