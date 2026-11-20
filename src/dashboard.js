// 主畫面：Demo 情境 + 需求輸入 + 偏好權重 + AI 智慧時間軸
import { DAYS, BUILDINGS, KINDS, PROVENANCE, DEMO_TEXT, demoCourses, placeName, placeShort } from './data.js';
import { parseTasks, computeSlots, buildPlan, reallocate, explain, fmt, toMin } from './engine.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MODES = [
  ['crowd', '🌿 優先避開人潮'],
  ['walk', '👟 最短步行距離'],
  ['focus', '🎯 高效率專注'],
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
  const slotsHtml = plan.slots.map((s) => `<span class="chip">${fmt(s.s)}–${fmt(s.e)} · ${s.e - s.s} 分</span>`).join('');

  const left = `
  <aside>
    <section class="card dcard">
      <div class="dh"><b>① 今日課表</b><button class="link" data-tab="schedule">編輯課表</button></div>
      <div class="daychips">${(daysWith.length ? daysWith : [pl.day]).map((d) => `<button class="dchip ${d === +pl.day ? 'on' : ''}" data-day="${d}">週${DAYS[d]}</button>`).join('')}</div>
      ${dayCourses.length ? dayCourses.map((c) => `<div class="mini"><time>${esc(c.start)}–${esc(c.end)}</time><span><b>${esc(c.name)}</b>${c.building ? `<small> · ${BUILDINGS[c.building] || ''}</small>` : ''}</span></div>`).join('') : '<p class="note">這天沒有課程，整天都是空堂。</p>'}
      <div class="mini free"><time>空堂</time><span>${slotsHtml || '<small>規劃時段內沒有空堂</small>'}</span></div>
      <label class="winl">規劃到幾點
        <select id="winEnd">${[[1020, '17:00'], [1080, '18:00'], [1200, '20:00'], [1320, '22:00']].map(([v, t]) => `<option value="${v}" ${pl.win.end === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
      </label>
    </section>
    <section class="card dcard">
      <div class="dh"><b>② 你今天想完成什麼？</b></div>
      <textarea id="nlText" rows="3" placeholder="例如：我想吃午餐、去圖書館讀書一小時，還要在五點前完成一份作業。">${esc(pl.text)}</textarea>
      <div class="row"><button class="primary" id="replan">✦ 產生行程</button><button class="outline" id="overload" title="壓力測試：塞入過多任務，看系統如何偵測衝突">＋ 加碼測試</button></div>
      <p class="note">支援「N 小時 / N 分鐘」與「N 點前」等說法；規則式解析，非大型語言模型。</p>
    </section>
    <section class="card dcard">
      <div class="dh"><b>③ 偏好權重</b></div>
      <div class="seg">${MODES.map(([id, t]) => `<button class="${pl.mode === id ? 'on' : ''}" data-mode="${id}">${t}</button>`).join('')}</div>
      <p class="note">${{ crowd: '以人潮、等待時間為主，安靜度為輔。', walk: '以步行總分鐘數最少為主，可能需要排隊。', focus: '用餐偏好最省時（可外帶），讀書偏好最安靜的地點。' }[pl.mode]}</p>
    </section>
  </aside>`;

  const banner = {
    ok: ['ok', '✅ 行程順暢', `所有任務已排入空堂，並預留移動緩衝。`],
    warn: ['warn', '⚠️ 時間緊繃警告', plan.warnings.map((w) => esc(w.text)).join('；')],
    bad: ['bad', '⛔ 時間衝突', plan.warnings.map((w) => esc(w.text)).join('；')],
  }[plan.level];
  const deferredN = pl.deferred.length;
  const bannerHtml = `<section class="banner ${banner[0]}"><div><b>${banner[1]}</b><p>${banner[2]}${deferredN ? ` <br>已將 ${deferredN} 項任務建議延後到晚上或明天。` : ''}</p></div>${plan.level !== 'ok' ? '<button class="primary" id="realloc">✦ AI 一鍵重新調配</button>' : '<button class="outline" id="realloc">重新最佳化</button>'}</section>`;

  const kpi = `<div class="kpis">
    <div class="kpi"><small>完成進度</small><b>${doneN}/${plan.items.length}</b></div>
    <div class="kpi"><small>預估總步行</small><b>${plan.totalWalk} 分</b></div>
    <div class="kpi"><small>少排隊（相較直覺選擇）</small><b>${plan.savedQueue} 分</b></div>
  </div>`;

  // 時間軸：課堂區塊 + 空堂區塊依時間排序
  const blocks = [];
  for (const c of dayCourses) {
    const s = toMin(c.start), e = toMin(c.end);
    if (e > pl.win.start && s < pl.win.end) blocks.push({ s, kind: 'class', c });
  }
  plan.slots.forEach((sl, i) => blocks.push({ s: sl.s, kind: 'slot', sl, i }));
  blocks.sort((a, b) => a.s - b.s);
  const tl = blocks.map((b) => (b.kind === 'class' ? classBlock(b.c) : slotBlock(b.sl, b.i, plan, pl))).join('');
  const unsched = plan.unscheduled.map((t) => `<article class="tcard bad"><div class="th"><span class="tk">${KINDS[t.kind].icon} ${KINDS[t.kind].label}</span><span class="tag bad">未排入</span></div><p>需 ${t.dur} 分鐘${t.deadline != null ? `，${fmt(t.deadline)} 前完成` : ''}。空堂不足，建議按「AI 一鍵重新調配」或延後。</p></article>`).join('');
  const deferred = pl.deferred.map((id) => pl.tasks.find((t) => t.id === id)).filter(Boolean).map((t) => `<article class="tcard defer"><div class="th"><span class="tk">${KINDS[t.kind].icon} ${KINDS[t.kind].label}</span><span class="tag">已延後</span></div><p>今天空堂不足，AI 建議挪到晚上或明天（${t.dur} 分鐘）。</p></article>`).join('');

  const right = `<section class="dright">
    ${bannerHtml}${kpi}
    <h2 class="th2">AI 智慧時間軸 · 週${DAYS[pl.day]}</h2>
    ${pl.tasks.length ? tl + unsched + deferred : '<section class="card">還沒有可解析的任務，請在左側輸入需求，或按上方「一鍵載入 Demo 情境」。</section>'}
    <details class="prov card"><summary>ⓘ 數據來源與限制</summary><p>${esc(PROVENANCE)}</p><p>地點名稱取自中央大學校園地圖；「第九餐廳」位於男九舍旁。K書中心位於中正圖書館 2F。</p></details>
  </section>`;

  return `<section class="hero compact">
    <div><small>AI 個人化校園行程助手 · 國立中央大學</small><h1>Smart Campus,<br><em>Smarter Schedule.</em></h1>
    <p>結合課表、空堂、人潮預估與步行距離，主動排出最適合你的一天，並說明每個決定的理由。</p></div>
    <div class="hero-actions"><button class="primary big" id="loadDemo">⚡ 一鍵載入中大 Demo 情境</button><small>也可在左側自行編輯課表與需求</small></div>
  </section>
  <div class="dash">${left}${right}</div>`;
}

function classBlock(c) {
  return `<div class="blk"><time>${esc(c.start)}–${esc(c.end)}</time><div><b>${esc(c.name)}</b>${c.building ? `<small> · ${BUILDINGS[c.building] || ''}</small>` : ''}</div><span class="tag">上課</span></div>`;
}

function slotBlock(sl, i, plan, pl) {
  const items = plan.items.filter((it) => it.slotIndex === i);
  const last = items[items.length - 1];
  const used = last ? last.end + (sl.next ? last.walkOut : 0) - sl.s : 0;
  const pct = Math.min(100, Math.round((used / (sl.e - sl.s)) * 100));
  return `<div class="slot"><div class="slot-h"><b>空堂 ${fmt(sl.s)}–${fmt(sl.e)}</b><small>${sl.e - sl.s} 分鐘 · 已規劃 ${pct}%</small><i class="bar"><u style="width:${pct}%"></u></i></div>
  ${items.length ? items.map((it) => taskCard(it, pl, plan)).join('') : '<p class="note">這段空堂沒有安排任務，可自由運用。</p>'}</div>`;
}

const crowdCls = (p) => (p >= 80 ? 'hi' : p >= 60 ? 'mid' : 'lo');
function taskCard(it, pl, plan) {
  const t = it.task, k = KINDS[t.kind], done = !!pl.done[t.id];
  const idx = pl.order.indexOf(t.id);
  const metric = t.kind === 'study' || t.kind === 'homework' || t.kind === 'group'
    ? `<span class="badge ${crowdCls(it.pct)}">空位率 ${100 - it.pct}%</span><span class="badge q">安靜 ${it.place.quiet}/5</span>`
    : `<span class="badge ${crowdCls(it.pct)}">人潮 ${it.pct}%</span>${it.queue ? `<span class="badge hi">排隊約 ${it.queue} 分</span>` : ''}`;
  const route = `<div class="route"><span>${esc(it.from ? placeShort(it.from) : '目前位置')}</span><i>${it.walkIn ? `🚶${it.walkIn}分` : '同地'}</i><span class="here">${esc(it.place.short)}</span>${it.slot.next ? `<i>🚶${it.walkOut}分</i><span>${esc(BUILDINGS[it.slot.next])}</span>` : ''}</div>`;
  const maps = `https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=${encodeURIComponent('國立中央大學 ' + (it.from ? placeName(it.from) : '總圖書館'))}&destination=${encodeURIComponent('國立中央大學 ' + it.place.name)}`;
  const alts = it.alts.filter((a) => !a.picked);
  const tags = [];
  if (it.shrunk > 0) tags.push(`<span class="tag warn">彈性縮短 ${it.shrunk} 分</span>`);
  if (it.slack != null && it.slack < 8) tags.push(`<span class="tag warn">緩衝僅 ${Math.max(it.slack, 0)} 分</span>`);
  if (it.pct >= 80 && t.kind === 'meal') tags.push('<span class="tag bad">人潮擁擠</span>');
  return `<article class="tcard ${done ? 'done' : ''}">
    <div class="th"><span class="tk">${k.icon} ${k.label}</span><time>${fmt(it.start)}–${fmt(it.end)}</time></div>
    <h3>${esc(it.place.name)}</h3>
    <div class="badges">${metric}<span class="badge sim">模擬估算</span>${tags.join('')}</div>
    ${route}
    <ul class="why">${explain(it).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    <div class="acts">
      <button class="chk ${done ? 'on' : ''}" data-done="${t.id}">${done ? '☑ 已完成' : '☐ 標示完成'}</button>
      ${alts.length ? `<button data-alt="${t.id}">⟳ 換個地點</button>` : ''}
      <button data-move="${t.id}:-1" ${idx <= 0 ? 'disabled' : ''} title="提早">↑</button><button data-move="${t.id}:1" ${idx >= pl.order.length - 1 ? 'disabled' : ''} title="延後">↓</button>
      <a href="${maps}" target="_blank" rel="noopener noreferrer">路線 ↗</a>
    </div>
    ${alts.length ? `<details class="altd"><summary>其他地點選擇（${alts.length}）</summary>${alts.map((a) => `<button class="altrow" data-pick="${t.id}:${a.id}"><span>${esc(a.name)}</span><small>${t.kind === 'meal' || t.kind === 'errand' ? '人潮 ' + a.pct + '%' + (a.queue ? ' · 排隊 ' + a.queue + ' 分' : '') : '空位率 ' + (100 - a.pct) + '%'} · 步行 ${a.walk} 分</small></button>`).join('')}</details>` : ''}
    ${t.kind !== 'group' ? `<details class="prov"><summary>ⓘ 這個數字怎麼來的？</summary><p>${esc(PROVENANCE)}</p></details>` : ''}
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
