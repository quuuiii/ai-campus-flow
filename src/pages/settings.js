// 設定：資料說明、分開清除（課表／觀察／全部）
import { ic } from '../icons.js';
import { esc, fmtTW } from '../util.js';
import { reviewQueue, review, members, setRole } from '../lib/auth.js';
import { syncConfig } from '../lib/sync.js';
import { PROVENANCE } from '../data/places.js';
import { clearCourses, clearObservations, clearAll, demoState } from '../store.js';

const ROLE = { reporter: '回報者（需審核）', member: '組員（直接核可）', admin: '管理員' };
const adm = { queue: null, members: null, error: '', busy: false };

function accountCard(ctx) {
  const a = ctx.auth, u = a.state.user;
  if (!a.configured) return `<section class="card"><div class="card-h"><h2>${ic('users')}帳號與團隊資料</h2><i class="tag warn">未設定</i></div><p class="note">尚未連接團隊資料庫，不需要登入。設定方式見 docs/supabase-plan.md。</p></section>`;
  if (!a.signedIn()) return `<section class="card"><div class="card-h"><h2>${ic('users')}帳號與團隊資料</h2><i class="tag">未登入</i></div>
    <p class="note" style="margin-bottom:10px">不登入也能回報（匿名，需管理員審核）。組員登入後由管理員設為「組員」，回報就會直接併入團隊資料。我們只用 email 登入，不收學號或姓名。</p>
    <form id="loginForm" novalidate><div class="form-err" id="loginErr" role="alert"></div>
      <label class="f"><span>Email</span><input name="email" type="email" inputmode="email" autocomplete="email" maxlength="200" placeholder="例如 學號@cc.ncu.edu.tw"></label>
      <button class="btn primary block" type="submit">${ic('nav', 16)}寄送登入連結</button></form></section>`;
  const admin = u?.role === 'admin';
  return `<section class="card"><div class="card-h"><h2>${ic('users')}帳號與團隊資料</h2><i class="tag ${u?.role === 'reporter' ? 'warn' : 'ok'}">${u ? ROLE[u.role] : a.state.loading ? '讀取中…' : '已登入'}</i></div>
    <p class="note">${u ? esc(u.email) : ''}${u?.role === 'reporter' ? '<br>你的回報目前仍需審核；請管理員把你設為「組員」。' : ''}</p>
    <div class="row" style="margin-top:8px"><button class="btn sm" id="logout">登出</button>${admin ? `<button class="btn sm outline" id="loadAdmin" ${adm.busy ? 'disabled' : ''}>${ic('refresh', 16)}${adm.busy ? '讀取中…' : '載入待審與成員'}</button>` : ''}</div>
    ${admin ? adminPanel() : ''}</section>`;
}
function adminPanel() {
  if (adm.error) return `<div class="banner bad" style="margin-top:10px">${ic('bad', 18)}<div>${esc(adm.error)}</div></div>`;
  if (!adm.queue) return '';
  return `<h3 style="margin:14px 0 4px;font-size:15px">待審回報（${adm.queue.length}）</h3>
    ${adm.queue.map((o) => `<div class="li"><div class="li-main"><b>${esc(o.place_id)} · ${o.crowd_level}/5${o.queue_minutes != null ? ' · 排隊 ' + o.queue_minutes + ' 分' : ''}</b><small>${esc(fmtTW(o.observed_at))} · ${esc(o.source)}${o.note ? ' · ' + esc(o.note) : ''}</small></div>
      <button class="icon-btn sm" data-rev="${esc(o.id)}:approved" aria-label="核可">${ic('check', 16)}</button><button class="icon-btn sm danger" data-rev="${esc(o.id)}:rejected" aria-label="拒絕">${ic('x', 16)}</button></div>`).join('') || '<p class="note">沒有待審回報。</p>'}
    <h3 style="margin:14px 0 4px;font-size:15px">成員（${adm.members.length}）</h3>
    ${adm.members.map((m) => `<div class="li"><div class="li-main"><b>${esc(m.email)}</b></div><select data-role="${esc(m.user_id)}" aria-label="${esc(m.email)} 的角色" style="width:auto">${Object.entries(ROLE).map(([k, v]) => `<option value="${k}" ${m.role === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>`).join('')}`;
}

export function renderSettings(ctx) {
  const n = ctx.state.courses.length, m = ctx.obs().length;
  return `<div class="page-head"><span class="eyebrow">Settings</span><h1>設定與資料</h1></div>
  <div class="stack">
  ${accountCard(ctx)}
  <section class="card"><div class="card-h"><h2>${ic('info')}關於 Campus Flow</h2></div>
    <p>課表只存在這台裝置的瀏覽器（localStorage），不會上傳。人潮觀察在未連接團隊資料庫時也只存本機；連接後才會上傳觀察紀錄（不含課表）。排程是<b>規則式演算法</b>，不是大型語言模型；人潮預測有一個統計模型，但只有在某地點的真實觀察資料通過驗證後才會啟用；在那之前都是模擬值（示範模式）。</p>
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
  const cfg = syncConfig(import.meta.env);
  const lf = $('#loginForm');
  if (lf) lf.onsubmit = async (e) => {
    e.preventDefault();
    const btn = lf.querySelector('button'), err = $('#loginErr'); btn.disabled = true;
    const r = await ctx.auth.send(new FormData(lf).get('email'));
    btn.disabled = false;
    if (r.ok) { ctx.toast('已寄出登入連結，請到信箱點擊連結', 'ok'); lf.reset(); err.classList.remove('on'); }
    else { err.innerHTML = ic('warn', 16) + '<span>' + esc(r.error) + '</span>'; err.classList.add('on'); }
  };
  const lo = $('#logout'); if (lo) lo.onclick = () => { adm.queue = adm.members = null; ctx.auth.signOut(); };
  const loadAdmin = async () => {
    adm.busy = true; adm.error = ''; ctx.rerender();
    try { const t = await ctx.auth.token(); [adm.queue, adm.members] = await Promise.all([reviewQueue(cfg, t), members(cfg, t)]); }
    catch (e) { adm.error = e.message || '讀取失敗'; } finally { adm.busy = false; ctx.rerender(); }
  };
  const la = $('#loadAdmin'); if (la) la.onclick = loadAdmin;
  document.querySelectorAll('[data-rev]').forEach((b) => (b.onclick = async () => {
    const [id, st] = b.dataset.rev.split(':'); b.disabled = true;
    try { await review(cfg, await ctx.auth.token(), id, st); adm.queue = adm.queue.filter((o) => o.id !== id); ctx.toast(st === 'approved' ? '已核可' : '已拒絕', 'ok'); }
    catch (e) { ctx.toast(e.message, 'bad'); } finally { ctx.rerender(); }
  }));
  document.querySelectorAll('[data-role]').forEach((sel) => (sel.onchange = async () => {
    try { await setRole(cfg, await ctx.auth.token(), sel.dataset.role, sel.value); adm.members.find((m) => m.user_id === sel.dataset.role).role = sel.value; ctx.toast('已更新角色', 'ok'); }
    catch (e) { ctx.toast(e.message, 'bad'); ctx.rerender(); }
  }));
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
