// 課表：新增／編輯／刪除、依星期與時間排序、週視圖、衝突提示
import { DAYS, esc, toMin, uid, TIME_RE, nowTW } from '../util.js';
import { ic } from '../icons.js';
import { BUILDINGS } from '../data/places.js';
import { COURSE_COLORS } from '../data/demo.js';
import { sanitizeCourse, findConflict, sortCourses } from '../store.js';

const view = { mode: 'week', editId: null, prefill: null };
// 中大節次：每節 hh:00–hh:50（與選課系統 A4 課表相同）
const PERIODS = [['1', 8], ['2', 9], ['3', 10], ['4', 11], ['Z', 12], ['5', 13], ['6', 14], ['7', 15], ['8', 16], ['9', 17], ['A', 18], ['B', 19], ['C', 20], ['D', 21], ['E', 22], ['F', 23]].map(([id, h]) => ({ id, h, s: h * 60, e: h * 60 + 50 }));
const pad = (n) => String(n).padStart(2, '0');
const covers = (c, p) => toMin(c.start) < p.e && toMin(c.end) > p.s;

function weekGrid(courses) {
  const today = nowTW().day, order = [0, 1, 2, 3, 4, 5, 6];
  const head = '<div class="hd">節</div>' + order.map((d) => `<div class="hd ${d === today ? 'today' : ''}">${DAYS[d]}</div>`).join('');
  const rows = PERIODS.map((p) => {
    const cells = order.map((d) => {
      const cs = courses.filter((c) => +c.day === d && covers(c, p));
      if (!cs.length) return `<button class="pc" data-cell="${d}:${p.id}" aria-label="週${DAYS[d]} 第${p.id}節 新增課程"></button>`;
      const c = cs[0], first = !courses.some((x) => x.id === c.id && +x.day === d && PERIODS.some((q) => q.s < p.s && covers(x, q)));
      const clash = cs.length > 1;
      return `<button class="pc has ${clash ? 'clash' : ''}" data-edit="${esc(c.id)}" style="background:${COURSE_COLORS[c.color]}" aria-label="${esc(c.name)} 週${DAYS[d]} 第${p.id}節，點擊編輯">${first ? `<b>${esc(c.name)}</b>${c.building ? `<small>${esc(BUILDINGS[c.building])}</small>` : ''}` : ''}</button>`;
    }).join('');
    return `<div class="pl"><b>${p.id}</b><small>${pad(p.h)}:00</small></div>${cells}`;
  }).join('');
  return `<div class="pgrid" role="group" aria-label="週課表（節次）">${head}${rows}</div>`;
}

function listView(courses) {
  if (!courses.length) return '<div class="empty">還沒有課程。用上方表單新增第一堂課吧。</div>';
  const out = [];
  for (let d = 0; d < 7; d++) {
    const cs = courses.filter((c) => +c.day === d);
    if (!cs.length) continue;
    out.push(`<h3 style="margin:14px 0 4px">週${DAYS[d]}</h3>` + cs.map((c) => `<div class="li"><div class="bar" style="background:${COURSE_COLORS[c.color]}"></div><div class="li-main"><b>${esc(c.name)}</b><small>${esc(c.start)}–${esc(c.end)}${c.building ? ' · ' + esc(BUILDINGS[c.building]) : ''}</small></div>
      <button class="icon-btn sm" data-edit="${esc(c.id)}" aria-label="編輯 ${esc(c.name)}">${ic('edit', 16)}</button><button class="icon-btn sm danger" data-del="${esc(c.id)}" aria-label="刪除 ${esc(c.name)}">${ic('trash', 16)}</button></div>`).join(''));
  }
  return out.join('');
}

export function renderSchedule(ctx) {
  const courses = sortCourses(ctx.state.courses), ed = courses.find((c) => c.id === view.editId) || null;
  const pf = view.prefill, v = ed || { day: pf?.day ?? (new Date().getDay() || 1), start: pf?.start ?? '09:00', end: pf?.end ?? '09:50', name: '', building: '', color: courses.length % 6 };
  return `<div class="page-head"><span class="eyebrow">Schedule</span><h1>我的課表</h1></div>
  <div class="grid2" style="align-items:start">
  <section class="card"><div class="card-h"><h2>${ic(ed ? 'edit' : 'plus')}${ed ? '編輯課程' : '新增課程'}</h2></div>
    <form id="courseForm" novalidate>
      <div class="form-err" id="courseErr" role="alert"></div>
      <label class="f"><span>課程名稱</span><input name="name" maxlength="50" required value="${esc(v.name)}" autocomplete="off"></label>
      <div class="two"><label class="f"><span>星期</span><select name="day">${DAYS.map((d, i) => `<option value="${i}" ${+v.day === i ? 'selected' : ''}>週${d}</option>`).join('')}</select></label>
      <label class="f"><span>教室建築</span><select name="building"><option value="">未指定</option>${Object.entries(BUILDINGS).map(([k, n]) => `<option value="${k}" ${v.building === k ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label></div>
      <div class="two"><label class="f"><span>開始節次</span><select id="perS">${PERIODS.map((p) => `<option value="${p.id}">${p.id}（${pad(p.h)}:00）</option>`).join('')}</select></label>
      <label class="f"><span>結束節次</span><select id="perE">${PERIODS.map((p) => `<option value="${p.id}">${p.id}（到 ${pad(p.h)}:50）</option>`).join('')}</select></label></div>
      <div class="two"><label class="f"><span>開始時間</span><input type="time" name="start" required value="${v.start}"></label><label class="f"><span>結束時間</span><input type="time" name="end" required value="${v.end}"></label></div>
      <div class="f"><span style="display:block;margin-bottom:6px">顏色</span><div class="swatches">${COURSE_COLORS.map((c, i) => `<label><input type="radio" name="color" value="${i}" ${+v.color === i ? 'checked' : ''} aria-label="顏色 ${i + 1}"><i style="background:${c}"></i></label>`).join('')}</div></div>
      <div class="row" style="margin-top:14px"><button class="btn primary" type="submit">${ic('check', 16)}${ed ? '儲存變更' : '加入課表'}</button>${ed ? `<button class="btn" type="button" id="cancelEdit">取消</button><button class="btn danger" type="button" data-del="${esc(ed.id)}">${ic('trash', 16)}刪除</button>` : ''}</div>
    </form></section>
  <section class="card"><div class="card-h"><h2>${ic('calendar')}課表 <small>${courses.length} 堂</small></h2>
    <div class="chips" style="margin:0"><button data-view="week" aria-pressed="${view.mode === 'week'}">週視圖</button><button data-view="list" aria-pressed="${view.mode === 'list'}">清單</button></div></div>
    ${view.mode === 'week' ? weekGrid(courses) + '<p class="note faint" style="margin-top:8px">格式同選課系統 A4 課表。點空白格＝新增（可選結束節次連堂）；點課程＝編輯或刪除。紅框＝時間重疊。</p>' : listView(courses)}</section></div>`;
}

export function bindSchedule(ctx) {
  const $ = (s) => document.querySelector(s), { state } = ctx;
  document.querySelectorAll('[data-view]').forEach((b) => (b.onclick = () => { view.mode = b.dataset.view; ctx.rerender(); }));
  document.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => { view.editId = b.dataset.edit; ctx.rerender(); document.querySelector('#courseForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }));
  document.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
    const c = state.courses.find((x) => x.id === b.dataset.del);
    if (!c || !confirm(`刪除「${c.name}」？`)) return;
    state.courses = state.courses.filter((x) => x.id !== c.id); state.demo = state.courses.some((x) => x.demo);
    view.editId = null; ctx.save(); ctx.rerender(); ctx.toast('已刪除課程', 'ok');
  }));
  document.querySelectorAll('[data-cell]').forEach((b) => (b.onclick = () => {
    const [d, id] = b.dataset.cell.split(':'), p = PERIODS.find((x) => x.id === id);
    view.editId = null; view.prefill = { day: +d, start: pad(p.h) + ':00', end: pad(p.h) + ':50' };
    ctx.rerender(); const f = document.querySelector('#courseForm'); f?.scrollIntoView({ behavior: 'smooth', block: 'center' }); f?.querySelector('input[name=name]').focus();
  }));
  const fs = $('#courseForm input[name=start]'), fe = $('#courseForm input[name=end]'), pS = $('#perS'), pE = $('#perE');
  const periodOf = (t, end) => { const m = toMin(t); const hit = end ? [...PERIODS].reverse().find((p) => p.s < m) : PERIODS.find((p) => m < p.s + 60); return (hit || (end ? PERIODS[0] : PERIODS[PERIODS.length - 1])).id; };
  const syncP = () => { pS.value = periodOf(fs.value, false); pE.value = periodOf(fe.value, true); };
  const fromP = () => {
    let a = PERIODS.findIndex((p) => p.id === pS.value), z = PERIODS.findIndex((p) => p.id === pE.value);
    if (z < a) { z = a; pE.value = pS.value; }
    fs.value = pad(PERIODS[a].h) + ':00'; fe.value = pad(PERIODS[z].h) + ':50'; fe.setCustomValidity('');
  };
  pS.onchange = fromP; pE.onchange = fromP;
  fs.addEventListener('change', syncP); fe.addEventListener('change', syncP); syncP();
  const cancel = $('#cancelEdit'); if (cancel) cancel.onclick = () => { view.editId = null; view.prefill = null; ctx.rerender(); };
  $('#courseForm').onsubmit = (e) => {
    e.preventDefault();
    const err = $('#courseErr'), d = Object.fromEntries(new FormData(e.target));
    const fail = (m) => { err.innerHTML = ic('warn', 16) + '<span>' + esc(m) + '</span>'; err.classList.add('on'); };
    d.name = String(d.name || '').trim(); d.color = +d.color;
    if (!d.name) return fail('請輸入課程名稱');
    if (!TIME_RE.test(d.start) || !TIME_RE.test(d.end)) return fail('請選擇有效的開始與結束時間');
    if (toMin(d.end) <= toMin(d.start)) return fail('結束時間必須晚於開始時間');
    const clash = findConflict(state.courses, d, view.editId);
    if (clash) return fail(`與「${clash.name}」（週${DAYS[clash.day]} ${clash.start}–${clash.end}）時間重疊，請調整後再儲存`);
    const c = sanitizeCourse({ ...d, id: view.editId || uid() });
    if (!c) return fail('課程資料不正確，請檢查欄位');
    if (view.editId) { const i = state.courses.findIndex((x) => x.id === view.editId); state.courses[i] = { ...c, ...(state.courses[i].demo ? { demo: true } : {}) }; }
    else state.courses.push(c);
    state.demo = state.courses.some((x) => x.demo);
    view.editId = null; view.prefill = null; ctx.save(); ctx.rerender(); ctx.toast('已儲存課程', 'ok');
  };
}
