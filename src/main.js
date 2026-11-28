// 入口：載入資料、簡易路由、共用 ctx（save / toast / go / rerender）
import './style.css';
import { ic } from './icons.js';
import { COURSE_COLORS } from './data/demo.js';
import { loadState, saveState, loadObservations, saveObservations, viewCourses, viewPlan, setDemo } from './store.js';
import { sessionFromHash, saveSession, loadSession, validToken, whoami, sendMagicLink, signOut } from './lib/auth.js';
import { syncConfig, enqueue, flush, pull, remoteObs, mergeObs, outbox, retryFailed } from './lib/sync.js';
import { renderHome, bindHome } from './pages/home.js';
import { renderPlan, bindPlan } from './pages/plan.js';
import { renderSchedule, bindSchedule } from './pages/schedule.js';
import { renderExplore, bindExplore } from './pages/explore.js';
import { renderSettings, bindSettings } from './pages/settings.js';

const TABS = [['home', 'home', '首頁', renderHome, bindHome], ['plan', 'sparkles', '規劃', renderPlan, bindPlan], ['schedule', 'calendar', '課表', renderSchedule, bindSchedule], ['explore', 'compass', '探索', renderExplore, bindExplore], ['settings', 'settings', '設定', renderSettings, bindSettings]];

const { state, report } = loadState();
let observations = loadObservations().list;
const syncCfg = syncConfig(import.meta.env);
// 已移除的示範人潮資料設定：清掉舊的 key
try { localStorage.removeItem('campus-flow-demo-days'); localStorage.removeItem('campus-flow-demo-scenario'); } catch { /* 忽略 */ }
let merged = null; // 本機＋團隊資料，快取到資料變動為止（模型評估以陣列為快取鍵）
const syncState = { lastPull: null, lastError: '', busy: false };
// 登入連結回來：從網址 hash 取出 token 後立刻清除網址，避免 token 留在瀏覽紀錄
const takeHash = () => {
  if (!syncCfg || !/access_token=|error_description=/.test(location.hash)) return '';
  const s = sessionFromHash(location.hash);
  history.replaceState(null, '', location.pathname + location.search);
  if (s?.error) return '登入失敗：' + s.error;
  if (s) { saveSession(localStorage, s); return 'ok'; }
  return '';
};
const authNotice = takeHash();
const authState = { user: null, loading: false };
document.documentElement.style.cssText += COURSE_COLORS.map((c, i) => `--c${i}:${c};`).join('');

const toast = (msg, type = '') => {
  const box = document.getElementById('toast'); if (!box) return;
  const t = document.createElement('div'); t.className = 'toast ' + type; t.setAttribute('role', 'status'); t.textContent = msg;
  box.appendChild(t); setTimeout(() => t.remove(), 3200);
};
const ctx = {
  state, toast,
  obs: () => observations,
  // 目前要顯示的課表與規劃（示範課表模式時為示範那一份，使用者資料不受影響）
  courses: () => viewCourses(state),
  plan: () => viewPlan(state),
  setDemoCourses: (on) => { setDemo(state, on); ctx.save(); render(true); },
  setObs: (l) => { observations = l; merged = null; return saveObservations(l); },
  // 預測、模型、儀表板用：本機紀錄＋團隊已核可資料（未設定同步時只有本機）
  allObs: () => (merged ??= syncCfg ? mergeObs(observations, remoteObs(localStorage)) : observations),
  auth: {
    configured: !!syncCfg, state: authState,
    signedIn: () => !!loadSession(localStorage),
    token: () => validToken(syncCfg, localStorage),
    send: (email) => sendMagicLink(syncCfg, email, location.origin + location.pathname),
    load: async () => {
      if (!syncCfg || authState.loading) return;
      authState.loading = true;
      try { const t = await validToken(syncCfg, localStorage); authState.user = t ? await whoami(syncCfg, t) : null; }
      catch { /* 離線：保留上次資訊 */ } finally { authState.loading = false; render(true); }
    },
    signOut: async () => { await signOut(syncCfg, localStorage); authState.user = null; render(true); },
  },
  sync: {
    configured: !!syncCfg, state: syncState,
    queue: () => outbox(localStorage),
    enqueue: (o) => (syncCfg ? enqueue(localStorage, o) : false),
    retry: () => { retryFailed(localStorage); return ctx.sync.run(); },
    run: async () => {
      if (!syncCfg || syncState.busy) return;
      syncState.busy = true;
      try {
        const token = await validToken(syncCfg, localStorage);
        const f = await flush(syncCfg, localStorage, undefined, token);
        const p = await pull(syncCfg, localStorage, undefined, token);
        if (p.ok) { syncState.lastPull = p.at; merged = null; }
        syncState.lastError = p.ok ? (f.failed ? `${f.failed} 筆上傳被拒絕` : '') : p.error;
      } finally { syncState.busy = false; render(true); }
    },
  },
  save: () => { if (!saveState(state)) toast('無法儲存：瀏覽器儲存空間不可用，資料將在關閉後消失', 'bad'); },
  go: (tab) => { state.ui.tab = tab; ctx.save(); render(); window.scrollTo(0, 0); },
  rerender: () => render(true),
};

function render(keepScroll = false) {
  const y = window.scrollY;
  const cur = TABS.find((t) => t[0] === state.ui.tab) || TABS[0];
  let body;
  try { body = cur[3](ctx); } catch (e) { console.error(e); body = `<div class="banner bad">${ic('bad', 18)}<div>這個頁面發生錯誤，已保留你的資料。請重新整理，或到「設定」頁匯出／清除資料。</div></div>`; }
  document.getElementById('app').innerHTML = `<header class="topbar"><div class="brand">${ic('route', 22)}Campus Flow</div><small>NCU</small></header>
  <main id="main" tabindex="-1">${body}</main>
  <nav class="tabbar" aria-label="主選單">${TABS.map(([id, icon, label]) => `<button data-tab="${id}" ${id === cur[0] ? 'aria-current="page"' : ''}>${ic(icon, 22)}<span>${label}</span></button>`).join('')}</nav>`;
  document.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => ctx.go(b.dataset.tab)));
  try { cur[4](ctx); } catch (e) { console.error(e); }
  if (keepScroll) window.scrollTo(0, y);
}

document.body.insertAdjacentHTML('beforeend', '<div id="toast" aria-live="polite"></div>');
render();
if (report.corruptBackup) toast('偵測到損壞的資料，已備份後重設', 'bad');
else if (report.migrated) toast('已從舊版載入你的課表', 'ok');
else if (report.migratedDemo) toast('示範課表已與你的課表分開保存', 'ok');
else if (report.dropped) toast(`有 ${report.dropped} 筆課程資料無效，已略過`, '');
if (authNotice === 'ok') toast('登入成功', 'ok'); else if (authNotice) toast(authNotice, 'bad');
if (syncCfg) { window.addEventListener('hashchange', () => { const n = takeHash(); if (n) { toast(n === 'ok' ? '登入成功' : n, n === 'ok' ? 'ok' : 'bad'); ctx.auth.load(); } }); ctx.auth.load(); ctx.sync.run(); window.addEventListener('online', () => ctx.sync.run()); }
if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('./sw.js').catch(() => {});
