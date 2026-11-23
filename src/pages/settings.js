// 設定：資料說明、分開清除（課表／觀察／全部）
import { ic } from '../icons.js';
import { PROVENANCE } from '../data/places.js';
import { clearCourses, clearObservations, clearAll, demoState } from '../store.js';

export function renderSettings(ctx) {
  const n = ctx.state.courses.length, m = ctx.obs().length;
  return `<div class="page-head"><span class="eyebrow">Settings</span><h1>設定與資料</h1></div>
  <div class="stack">
  <section class="card"><div class="card-h"><h2>${ic('info')}關於 Campus Flow</h2></div>
    <p>課表與觀察紀錄只存在這台裝置的瀏覽器（localStorage），沒有上傳到任何伺服器。排程是<b>規則式演算法</b>，不是大型語言模型；人潮預測有一個統計模型，但只有在某地點的真實觀察資料通過驗證後才會啟用；在那之前都是模擬值（示範模式）。</p>
    <p style="margin-top:8px" class="note">${PROVENANCE}</p></section>
  <section class="card"><div class="card-h"><h2>${ic('flask')}示範資料</h2></div>
    <p class="note" style="margin-bottom:10px">載入示範課表與情境（不會動到你的人潮觀察紀錄）。這會取代目前課表，請先確認。</p>
    <button class="btn outline" id="loadDemo">${ic('zap', 16)}載入中大示範情境</button></section>
  <section class="card"><div class="card-h"><h2>${ic('trash')}清除資料</h2></div>
    <div class="stack">
      <div class="li"><div class="li-main"><b>課表與規劃設定</b><small>目前 ${n} 堂課</small></div><button class="btn sm danger" id="clrCourses">清除課表</button></div>
      <div class="li"><div class="li-main"><b>人潮觀察紀錄</b><small>目前 ${m} 筆（建議先匯出 CSV 備份）</small></div><button class="btn sm danger" id="clrObs">清除觀察</button></div>
      <div class="li"><div class="li-main"><b>全部資料</b><small>課表、規劃設定與觀察紀錄</small></div><button class="btn sm danger" id="clrAll">全部清除</button></div>
    </div></section></div>`;
}

export function bindSettings(ctx) {
  const $ = (s) => document.querySelector(s), { state } = ctx;
  $('#loadDemo').onclick = () => {
    if (state.courses.length && !state.demo && !confirm('這會取代你目前的課表為示範資料。確定嗎？')) return;
    const d = demoState(); state.courses = d.courses; state.plan = d.plan; state.demo = true; ctx.save(); ctx.go('home'); ctx.toast('已載入示範情境', 'ok');
  };
  $('#clrCourses').onclick = () => { if (!confirm('清除所有課程？觀察紀錄不受影響。')) return; clearCourses(state); ctx.save(); ctx.rerender(); ctx.toast('已清除課表', 'ok'); };
  $('#clrObs').onclick = () => { if (!confirm('清除所有人潮觀察紀錄？此動作無法復原。')) return; if (clearObservations()) { ctx.setObs([]); ctx.rerender(); ctx.toast('已清除觀察紀錄', 'ok'); } else ctx.toast('清除失敗', 'bad'); };
  $('#clrAll').onclick = () => {
    if (!confirm('清除全部資料（課表、設定、觀察紀錄）？此動作無法復原。')) return;
    if (!clearAll()) return ctx.toast('清除失敗', 'bad');
    state.courses = []; clearCourses(state); ctx.setObs([]); ctx.rerender(); ctx.toast('已清除全部資料', 'ok');
  };
}
