// 首頁：今日概況、下一堂課倒數、空堂、捷徑、建議用餐時段、人潮摘要（皆標示資料來源）
import { DAYS, esc, fmt, toMin, nowTW } from '../util.js';
import { ic } from '../icons.js';
import { BUILDINGS, PLACES } from '../data/places.js';
import { computeSlots } from '../engine/scheduler.js';
import { predictCrowd, bestTime, levelOf, approx, modelReport, SOURCE_LABEL } from '../engine/crowd.js';

export function renderHome(ctx) {
  const { state } = ctx, now = nowTW(), obs = ctx.obs();
  const today = state.courses.filter((c) => +c.day === now.day).sort((a, b) => toMin(a.start) - toMin(b.start));
  const next = today.find((c) => toMin(c.start) > now.minute);
  const cur = today.find((c) => toMin(c.start) <= now.minute && toMin(c.end) > now.minute);
  const slots = computeSlots(state.courses, now.day, { start: Math.max(now.minute, 420), end: 1260 });
  const eatPlace = PLACES.backdoor;
  const best = bestTime(eatPlace, 660, 810, obs, now.day);
  const dateStr = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  const left = next ? toMin(next.start) - now.minute : null;
  const cd = left == null ? '' : left >= 60 ? `${Math.floor(left / 60)} 小時 ${left % 60} 分` : `${left} 分鐘`;
  const crowdPlaces = [PLACES.backdoor, PLACES.female14, PLACES.mainlib, PLACES.zhongzheng];
  const rows = crowdPlaces.map((p) => {
    const r = predictCrowd(p, now.minute, obs, now.day), study = p.vac != null, pct = approx(study ? 100 - r.pct : r.pct);
    return `<div class="crowd-row"><div class="li-main"><b>${esc(p.short)}</b><small>${study ? '空位' : '人潮'} ${pct}%${study ? '' : '（' + levelOf(r.pct) + '）'}</small></div><div class="meter" aria-hidden="true"><i class="${study ? '' : r.pct >= 70 ? 'hi' : r.pct >= 40 ? 'mid' : ''}" style="width:${pct}%"></i></div><i class="tag src-${r.source}">${SOURCE_LABEL[r.source]}</i></div>`;
  }).join('');

  return `<section class="hero"><div><span class="eyebrow">Today · 台灣時間</span><h1>${esc(dateStr)}</h1></div>
    <p>${cur ? `正在上課：${esc(cur.name)}（到 ${esc(cur.end)}）` : today.length ? '今天有 ' + today.length + ' 堂課' : '今天沒有課，整天都是空堂'}</p></section>
  ${modelReport(obs).mode === 'demo' ? `<div class="banner warn">${ic('flask', 18)}<div><b>示範模式：</b>人潮與排隊數字為人工模擬，尚無通過驗證的預測模型。</div></div>` : ''}
  ${state.demo ? `<div class="banner info">${ic('flask', 18)}<div>目前顯示的是<b>示範課表</b>。到「課表」頁加入自己的課程，示範資料會在你清除後消失。</div></div>` : ''}
  <div class="quick" role="group" aria-label="捷徑">
    <button data-go="plan">${ic('sparkles', 22)}規劃</button><button data-go="schedule">${ic('calendar', 22)}課表</button>
    <button data-go="explore">${ic('compass', 22)}探索</button><button data-go-crowd>${ic('users', 22)}回報</button></div>
  <div class="grid2">
    <section class="card"><div class="card-h"><h2>${ic('clock')}下一堂課</h2></div>
      ${next ? `<div class="next"><div class="bar" style="background:var(--c${next.color},#2f6fed);height:48px"></div><div><div class="next-t">${esc(next.start)} <small>· ${cd}後</small></div><b>${esc(next.name)}</b><small style="display:block">${next.building ? esc(BUILDINGS[next.building]) : '未指定教室'}</small></div></div>` : '<p class="empty">今天沒有後續課程了。</p>'}</section>
    <section class="card"><div class="card-h"><h2>${ic('timer')}今天的空堂</h2></div>
      ${slots.length ? `<div class="slotchips">${slots.map((s) => `<i class="chip">${fmt(s.s)}–${fmt(s.e)}</i>`).join('')}</div><p class="note" style="margin-top:8px">到「規劃」頁，把空堂排成行程。</p>` : '<p class="empty">目前沒有可用空堂。</p>'}</section>
    <section class="card"><div class="card-h"><h2>${ic('meal')}建議用餐時段</h2><i class="tag src-${best.source}">${SOURCE_LABEL[best.source]}</i></div>
      <div class="big">${fmt(best.minute)}</div><p class="note">後門餐飲區在 11:00–13:30 之間預估較不擁擠的時間點（人潮約 ${approx(best.pct)}%）。${esc(best.note)}。</p></section>
    <section class="card"><div class="card-h"><h2>${ic('users')}校園人潮摘要</h2></div>${rows}
      <p class="note faint" style="margin-top:8px">${obs.length >= 3 ? `已有 ${obs.length} 筆觀察紀錄；觀察不足的地點仍顯示模擬值。` : '尚無足夠的真實觀察，以上為<b>模擬示範值</b>，不是即時資料。'}</p></section>
  </div>`;
}

export function bindHome(ctx) {
  document.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => ctx.go(b.dataset.go)));
  const c = document.querySelector('[data-go-crowd]');
  if (c) c.onclick = () => { ctx.state.ui.exploreTab = 'crowd'; ctx.go('explore'); };
}
