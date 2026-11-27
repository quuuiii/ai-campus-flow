// 探索：校園地點 / 後門美食 / 宵夜街美食 / 人潮觀察
import { esc, fmtTW, downloadText, isoTW, DAYS } from '../util.js';
import { ic } from '../icons.js';
import { PLACES } from '../data/places.js';
import { CAMPUS_LOCATIONS, LOCATION_KINDS, SOURCES } from '../data/locations.js';
import { FOOD, FOOD_CATEGORIES } from '../data/food.js';
import { addObservation, deleteObservation, obsToCSV, importObservationsCSV } from '../store.js';
import { sufficiency, obsPlaceId, MIN_SAMPLES, modelReport } from '../engine/crowd.js';
import { MIN_SAMPLES as MODEL_MIN, MIN_DATES } from '../engine/model.js';
import { dashboardStats, BANDS, DAY_ORDER } from '../engine/stats.js';

const TABS = [['places', 'map', '校園地點'], ['back', 'meal', '後門美食'], ['night', 'coffee', '宵夜街美食'], ['crowd', 'eye', '人潮觀察']];
const q = { place: '', cat: '全部', food: '', fcat: '全部', sel: '' };
const mapSearch = (s) => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s);
// 不內建任何建築物座標：地圖以「地點名稱」搜尋定位，位置由地圖服務解析（未經逐點人工驗證）
const embedUrl = (query) => 'https://maps.google.com/maps?hl=zh-TW&output=embed&q=' + encodeURIComponent(query);
const CAMPUS_Q = '國立中央大學';

export function renderExplore(ctx) {
  const tab = ctx.state.ui.exploreTab;
  const tabs = `<div class="tabs" role="tablist" aria-label="探索分類">${TABS.map(([id, icon, t]) => `<button role="tab" id="tab-${id}" aria-selected="${tab === id}" aria-controls="pane" data-etab="${id}">${ic(icon, 16)}${t}</button>`).join('')}</div>`;
  const body = tab === 'places' ? placesPane() : tab === 'crowd' ? crowdPane(ctx) : foodPane(tab === 'back' ? '後門' : '宵夜街');
  return `<div class="page-head"><span class="eyebrow">Explore NCU</span><h1>探索中央大學</h1></div>${tabs}<div id="pane" role="tabpanel" aria-labelledby="tab-${tab}">${body}</div>`;
}

function placesPane() {
  const kinds = ['全部', ...LOCATION_KINDS];
  return `<div class="stack">
  <section class="card"><div class="card-h"><h2>${ic('map')}校園地圖</h2><a class="btn sm outline" id="mapOpen" href="${mapSearch(CAMPUS_Q)}" target="_blank" rel="noopener noreferrer">用地圖 App 開啟 ${ic('nav', 14)}</a></div>
    <p class="note" id="mapSel" style="margin-bottom:8px">點下方任一地點，地圖會定位到該地點。</p>
    <div class="map" id="mapBox"><iframe id="mapFrame" title="國立中央大學校園地圖" loading="lazy" src="${embedUrl(CAMPUS_Q)}"></iframe>
      <div class="fallback">${ic('map', 28)}<b>地圖暫時無法載入</b><span>可能是網路不穩或被瀏覽器擋下。你仍可用下方連結開啟地圖。</span><a class="btn sm" href="${mapSearch(CAMPUS_Q)}" target="_blank" rel="noopener noreferrer">用新分頁開啟</a></div></div></section>
  <section class="card"><div class="card-h"><h2>${ic('search')}校園地點</h2></div>
    <div class="two"><label class="f"><span class="sr">類型</span><select id="locCat" aria-label="類型">${kinds.map((k) => `<option ${q.cat === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
    <label class="f"><span class="sr">搜尋</span><input id="locQ" type="search" placeholder="搜尋地點" aria-label="搜尋地點" value="${esc(q.place)}"></label></div>
    <div id="locList"></div>
    <p class="note faint" style="margin-top:10px">說明整理自中大官方導覽圖與圖書館等公開資料，不含營業時間；松苑、第九餐廳暫停營業，未列入。地圖按鈕以名稱搜尋，位置以地圖為準。</p></section></div>`;
}
function locList() {
  const k = q.place.trim().toLowerCase();
  const items = CAMPUS_LOCATIONS.filter((l) => (q.cat === '全部' || l.kind === q.cat) && (!k || (l.name + l.description).toLowerCase().includes(k)));
  return items.length ? items.map((l) => `<div class="li"><div class="li-main"><b>${esc(l.name)}</b><small>${esc(l.kind)} · ${esc(l.description)}</small><small>來源：${esc(SOURCES[l.source] || '')}</small></div><button class="icon-btn" data-showmap="${esc(l.name)}" aria-label="在地圖上顯示 ${esc(l.name)}" aria-pressed="${q.sel === l.name}" style="${q.sel === l.name ? 'background:var(--mint-bg);color:var(--mint-d);border-color:var(--mint)' : ''}">${ic('pin', 18)}</button><a class="icon-btn" href="${mapSearch(l.query)}" target="_blank" rel="noopener noreferrer" aria-label="用地圖 App 開啟 ${esc(l.name)}">${ic('nav', 18)}</a></div>`).join('') : '<div class="empty">找不到符合的地點。</div>';
}

function foodPane(area) {
  const all = FOOD.filter((f) => f.area === area);
  return `<section class="card"><div class="card-h"><h2>${ic('meal')}${area}美食 <small>${all.length} 間</small></h2></div>
    <div class="banner warn" style="margin-bottom:12px">${ic('warn', 18)}<div>名單來自歷史資料，<b>營業狀態待確認</b>。這裡不提供價格、營業時間或評價，請以店家最新公告為準。</div></div>
    <label class="f"><span class="sr">搜尋店家</span><input id="foodQ" type="search" placeholder="搜尋店名或類型" aria-label="搜尋店名或類型" value="${esc(q.food)}"></label>
    <div class="chips" role="group" aria-label="料理分類">${FOOD_CATEGORIES.map((c) => `<button data-fcat="${c}" aria-pressed="${q.fcat === c}">${c}</button>`).join('')}</div>
    <div id="foodList" data-area="${area}"></div></section>`;
}
function foodList(area) {
  const k = q.food.trim().toLowerCase();
  const items = FOOD.filter((f) => f.area === area && (q.fcat === '全部' || f.category === q.fcat) && (!k || (f.name + f.type + f.category).toLowerCase().includes(k)));
  return items.length ? `<p class="note" style="margin-bottom:4px">共 ${items.length} 間</p>` + items.map((f) => `<div class="li"><div class="li-main"><b>${esc(f.name)}</b><small>${esc(f.type)}</small><div class="pills" style="margin-top:6px"><i class="tag">${esc(f.category)}</i><i class="tag warn">營業狀態待確認</i></div></div><a class="icon-btn" href="${mapSearch('國立中央大學 ' + area + ' ' + f.name)}" target="_blank" rel="noopener noreferrer" aria-label="在地圖搜尋 ${esc(f.name)}">${ic('nav', 18)}</a></div>`).join('') : '<div class="empty">找不到符合的店家，試試其他關鍵字或分類。</div>';
}

function crowdPane(ctx) {
  const list = ctx.obs();
  const all = ctx.allObs(), dash = dashboardStats(all);
  const heat = (n) => (n === 0 ? '#f3f7f6' : `rgba(18,168,139,${(0.18 + 0.82 * (n / dash.max)).toFixed(2)})`);
  const dashCard = `<section class="card"><div class="card-h"><h2>${ic('chart')}資料儀表板</h2><small>${ctx.sync.configured ? '本機＋團隊' : '僅本機'}</small></div>
    <div class="stat"><div><b>${dash.total}</b><small>總觀察筆數</small></div><div><b>${dash.readyForTraining}/${dash.rows.length}</b><small>達訓練門檻地點</small></div><div><b>${dash.last ? esc(fmtTW(dash.last.toISOString())).slice(5, 16) : '—'}</b><small>最近更新</small></div></div>
    <h3 style="margin:14px 0 6px;font-size:14px">各地點樣本（門檻：${MODEL_MIN} 筆、${MIN_DATES} 天）</h3>
    ${dash.rows.map((r) => `<div class="li"><div class="li-main"><b>${esc(r.place.short)}</b><small>${r.n} 筆 · ${r.dates} 天${r.last ? ' · 最近 ' + esc(fmtTW(r.last.toISOString())) : ''}</small><div class="meter" style="max-width:none;margin-top:6px" aria-hidden="true"><i style="width:${Math.min(100, (r.n / MODEL_MIN) * 100)}%"></i></div></div><i class="tag ${r.meetsMin ? 'ok' : r.n ? 'warn' : 'bad'}">${r.meetsMin ? '達門檻' : r.n ? `差 ${r.needN} 筆${r.needDates ? `、${r.needDates} 天` : ''}` : '無資料'}</i></div>`).join('')}
    <h3 style="margin:14px 0 6px;font-size:14px">星期 × 時段分布</h3>
    <div style="overflow-x:auto"><table class="heat" aria-label="星期與時段的觀察筆數"><thead><tr><th></th>${BANDS.map((b) => `<th>${b.label}</th>`).join('')}</tr></thead>
    <tbody>${DAY_ORDER.map((d) => `<tr><th>週${DAYS[d]}</th>${BANDS.map((b) => `<td style="background:${heat(dash.grid[d][b.id])}">${dash.grid[d][b.id] || ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    ${dash.missing.length ? `<p class="note" style="margin-top:8px">缺資料地點：${dash.missing.map((p) => esc(p.short)).join('、')}</p>` : ''}
    ${dash.unknown ? `<p class="note faint">另有 ${dash.unknown} 筆舊紀錄沒有地點代碼，未列入統計。</p>` : ''}</section>`;
  const q = ctx.sync.queue(), pend = q.filter((x) => x.status === 'pending').length, fail = q.filter((x) => x.status === 'failed');
  const st = ctx.sync.state;
  const syncCard = `<section class="card"><div class="card-h"><h2>${ic('cloud')}團隊同步</h2><i class="tag ${ctx.sync.configured ? 'ok' : 'warn'}">${ctx.sync.configured ? '已設定' : '未設定'}</i></div>
    ${ctx.sync.configured ? `<p class="note">待上傳 ${pend} 筆${fail.length ? `、被拒絕 ${fail.length} 筆` : ''}${st.lastPull ? ` · 上次下載 ${esc(fmtTW(st.lastPull))}` : ''}${st.lastError ? ` · <b>${esc(st.lastError)}</b>` : ''}</p>
      ${fail.slice(0, 3).map((x) => `<p class="note faint">${esc(x.obs.place)}：${esc(x.error)}</p>`).join('')}
      <div class="row" style="margin-top:8px"><button class="btn sm" id="syncNow" ${st.busy ? 'disabled' : ''}>${ic('refresh', 16)}${st.busy ? '同步中…' : '立即同步'}</button>${fail.length ? `<button class="btn sm outline" id="syncRetry">重試被拒絕的</button>` : ''}</div>
      <p class="note faint" style="margin-top:8px">匿名回報需管理員審核後才會出現在團隊資料；在這裡刪除只會刪本機，不會刪伺服器上的紀錄。</p>`
    : '<p class="note">尚未連接團隊資料庫，紀錄只存在這支手機。設定方式見專案的 docs/supabase-plan.md（需要建立 Supabase 帳號並設定 Vercel 環境變數）。</p>'}</section>`;
  const sorted = [...list].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const rep = modelReport(all);
  const ST = { insufficient: ['資料不足', 'tag'], 'not-better': ['未優於模擬', 'tag warn'], ready: ['模型可用', 'tag ok'] };
  const modelCard = `<section class="card"><div class="card-h"><h2>${ic('target')}預測模型狀態</h2><i class="tag ${rep.mode === 'demo' ? 'warn' : 'ok'}">${rep.mode === 'demo' ? '示範模式' : rep.mode === 'partial' ? '部分地點可用' : '全部可用'}</i></div>
    <div class="banner ${rep.mode === 'demo' ? 'warn' : 'info'}" style="margin-bottom:10px">${ic(rep.mode === 'demo' ? 'flask' : 'info', 18)}<div>${rep.mode === 'demo' ? '<b>示範模式：</b>目前沒有任何地點通過模型驗證，規劃頁的人潮數字是人工模擬值（或少量觀察的混合），<b>不是預測</b>。' : '通過驗證的地點才會標示「模型」；其餘仍為模擬／觀察混合。'}</div></div>
    <p class="note" style="margin-bottom:8px">模型：核平滑回歸（時間核寬 45 分鐘），向模擬值收縮。啟用條件：每地點 ≥ ${MODEL_MIN} 筆、≥ ${MIN_DATES} 個不同日期，且「留一日驗證」平均誤差（MAE，單位為百分點）≤ 模擬基準的 90% 並優於全體平均基準。觀察的 1–5 級以 10/30/50/70/90% 換算，為假設。</p>
    ${rep.rows.map((r) => `<div class="li"><div class="li-main"><b>${esc(r.place.short)}</b><small>${r.n} 筆 · ${r.dates} 天${r.maeModel != null ? ` · MAE 模型 ${r.maeModel.toFixed(1)}／模擬 ${r.maeSim.toFixed(1)}／平均 ${r.maeMean.toFixed(1)}` : ''}</small><small>${esc(r.reason)}</small></div><i class="${ST[r.status][1]}">${ST[r.status][0]}</i></div>`).join('')}
    <p class="note faint" style="margin-top:8px">尚未在真實資料上訓練或驗證；上表會隨你們累積的觀察紀錄自動更新。</p></section>`;
  return `<div class="stack">
  <div class="banner info">${ic('info', 18)}<div><b>資料來源說明：</b>每個地點累積 ≥ ${MIN_SAMPLES} 筆觀察後，才會與模擬值混合納入預測；不足時一律標示「模擬」，不會假裝成即時預測。</div></div>
  <div class="grid2" style="align-items:start">
  <section class="card"><div class="card-h"><h2>${ic('plus')}新增觀察</h2></div>
    <form id="obsForm" novalidate><div class="form-err" id="obsErr" role="alert"></div>
      <label class="f"><span>地點</span><select name="placeId">${Object.values(PLACES).filter((p) => !p.nodata).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
      <div class="f"><span style="display:block;margin-bottom:6px;font-weight:700">擁擠度</span><div class="rate" role="radiogroup" aria-label="擁擠度">${[[1, '很空'], [2, '偏空'], [3, '普通'], [4, '擁擠'], [5, '爆滿']].map(([n, t]) => `<label><input type="radio" name="crowd" value="${n}" ${n === 3 ? 'checked' : ''}><span>${n}<small>${t}</small></span></label>`).join('')}</div></div>
      <div class="two"><label class="f"><span>排隊分鐘（選填）</span><input name="queue" type="number" inputmode="numeric" min="0" max="180" placeholder="例如 5"></label>
      <label class="f"><span>觀察方式</span><select name="method" id="obsMethod"><option value="onsite">現場觀察（現在）</option><option value="manual">事後紀錄</option></select></label></div>
      <label class="f" id="whenBox" hidden><span>實際時間（台灣時間）</span><input type="datetime-local" name="when" value="${isoTW(new Date()).slice(0, 16)}"></label>
      <label class="f"><span>備註（選填）</span><input name="note" maxlength="100" placeholder="例如：下課後突然變多"></label>
      <button class="btn primary block" type="submit">${ic('check', 16)}儲存觀察</button></form></section>
  <section class="card"><div class="card-h"><h2>${ic('db')}已記錄 ${list.length} 筆</h2></div>
    <div class="row" style="margin-bottom:10px"><button class="btn sm" id="expObs" ${list.length ? '' : 'disabled'}>${ic('download', 16)}匯出 CSV</button><label class="btn sm" style="cursor:pointer">${ic('upload', 16)}匯入 CSV<input id="impObs" type="file" accept=".csv,text/csv" hidden></label></div>
    ${list.length ? '' : '<p class="note">還沒有觀察資料。</p>'}</section></div>
  ${dashCard}
  ${modelCard}
  ${syncCard}
  <section class="card"><div class="card-h"><h2>${ic('list')}觀察紀錄</h2></div>
    ${sorted.length ? sorted.slice(0, 50).map((o) => `<div class="li"><div class="li-main"><b>${esc(o.place)} · ${o.crowd}/5${o.queue != null ? ' · 排隊 ' + o.queue + ' 分' : ''}</b><small>${esc(fmtTW(o.timestamp))} · ${o.method === 'manual' ? '事後紀錄' : '現場觀察'}${o.note ? ' · ' + esc(o.note) : ''}</small></div><button class="icon-btn sm danger" data-delobs="${esc(o.id)}" aria-label="刪除這筆紀錄">${ic('trash', 16)}</button></div>`).join('') + (sorted.length > 50 ? `<p class="note">僅顯示最新 50 筆，匯出可取得全部。</p>` : '') : '<div class="empty">尚無紀錄。</div>'}</section></div>`;
}

export function bindExplore(ctx) {
  const $ = (s) => document.querySelector(s), tab = ctx.state.ui.exploreTab;
  document.querySelectorAll('[data-etab]').forEach((b) => (b.onclick = () => { ctx.state.ui.exploreTab = b.dataset.etab; ctx.save(); ctx.rerender(); }));
  if (tab === 'places') {
    const box = $('#mapBox'), fr = $('#mapFrame'); let ok = false, timer;
    const watch = () => { ok = false; box.classList.remove('failed'); clearTimeout(timer); timer = setTimeout(() => { if (!ok || navigator.onLine === false) box.classList.add('failed'); }, 8000); };
    const show = (name) => {
      const l = CAMPUS_LOCATIONS.find((x) => x.name === name); if (!l) return;
      q.sel = name; fr.src = embedUrl(l.query); watch();
      $('#mapSel').textContent = `地圖定位：${l.name}（以名稱搜尋，位置由地圖服務解析）`; $('#mapOpen').href = mapSearch(l.query);
      draw(); box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    const draw = () => { $('#locList').innerHTML = locList(); document.querySelectorAll('[data-showmap]').forEach((b) => (b.onclick = () => show(b.dataset.showmap))); };
    $('#locCat').onchange = (e) => { q.cat = e.target.value; draw(); };
    $('#locQ').oninput = (e) => { q.place = e.target.value; draw(); };
    draw();
    fr.addEventListener('load', () => { ok = true; });
    fr.addEventListener('error', () => box.classList.add('failed'));
    watch();
  } else if (tab === 'back' || tab === 'night') {
    const area = tab === 'back' ? '後門' : '宵夜街', draw = () => ($('#foodList').innerHTML = foodList(area));
    $('#foodQ').oninput = (e) => { q.food = e.target.value; draw(); };
    document.querySelectorAll('[data-fcat]').forEach((b) => (b.onclick = () => { q.fcat = b.dataset.fcat; document.querySelectorAll('[data-fcat]').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw(); }));
    draw();
  } else bindCrowd(ctx);
}

function bindCrowd(ctx) {
  const $ = (s) => document.querySelector(s);
  const method = $('#obsMethod'); method.onchange = () => { $('#whenBox').hidden = method.value !== 'manual'; };
  $('#obsForm').onsubmit = (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target)), err = $('#obsErr');
    const fail = (m) => { err.innerHTML = ic('warn', 16) + '<span>' + esc(m) + '</span>'; err.classList.add('on'); };
    const place = PLACES[d.placeId];
    if (!place) return fail('請選擇地點');
    if (d.queue !== '' && !(Number.isInteger(+d.queue) && +d.queue >= 0 && +d.queue <= 180)) return fail('排隊分鐘請輸入 0–180 的整數');
    let ts = new Date().toISOString();
    if (d.method === 'manual') {
      const t = new Date(d.when + ':00+08:00');
      if (!d.when || Number.isNaN(t.getTime())) return fail('請輸入有效的觀察時間');
      if (t.getTime() > Date.now() + 60000) return fail('觀察時間不能在未來');
      ts = t.toISOString();
    }
    const r = addObservation(ctx.obs(), { place: place.name, placeId: place.id, crowd: d.crowd, queue: d.queue, method: d.method, note: d.note, timestamp: ts });
    if (!r.added) return fail('資料不完整，未儲存');
    if (!ctx.setObs(r.list)) return ctx.toast('儲存失敗：瀏覽器儲存空間可能已滿或被停用', 'bad');
    if (ctx.sync.enqueue(r.added)) ctx.sync.run();
    ctx.rerender(); ctx.toast(ctx.sync.configured ? '已儲存，正在上傳團隊資料庫' : '已儲存觀察（僅本機）', 'ok');
  };
  document.querySelectorAll('[data-delobs]').forEach((b) => (b.onclick = () => {
    if (!confirm('刪除這筆觀察紀錄？')) return;
    ctx.setObs(deleteObservation(ctx.obs(), b.dataset.delobs)); ctx.rerender(); ctx.toast('已刪除', 'ok');
  }));
  const sn = $('#syncNow'); if (sn) sn.onclick = () => ctx.sync.run();
  const sr = $('#syncRetry'); if (sr) sr.onclick = () => ctx.sync.retry();
  const exp = $('#expObs');
  if (exp) exp.onclick = () => { downloadText(`campus-flow-observations-${isoTW().slice(0, 10)}.csv`, obsToCSV(ctx.obs())); ctx.toast('已匯出 CSV', 'ok'); };
  $('#impObs').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 2_000_000) return ctx.toast('檔案過大（上限 2 MB）', 'bad');
    try {
      const r = importObservationsCSV(ctx.obs(), await f.text());
      if (r.error) return ctx.toast(r.error, 'bad');
      if (!ctx.setObs(r.list)) return ctx.toast('儲存失敗', 'bad');
      ctx.rerender(); ctx.toast(`匯入 ${r.added} 筆，略過重複 ${r.skipped}，無效 ${r.invalid}`, r.added ? 'ok' : '');
    } catch { ctx.toast('無法讀取檔案', 'bad'); }
  };
}
