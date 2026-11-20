// 狀態與 localStorage：載入、驗證、遷移、儲存。資料損壞時不丟失（備份後重設）、不覆蓋使用者資料。
import { demoCourses, DEMO_TEXT } from './data/demo.js';
import { BUILDINGS, PLACES, KINDS } from './data/places.js';
import { TIME_RE, toMin, uid, isoTW, toCSV, parseCSV, fmtTW } from './util.js';
import { parseTasks } from './engine/scheduler.js';

export const KEYS = { state: 'campus-flow-v2', legacy: 'campus-flow-v1', obs: 'campus-flow-observations-v1' };
export const MODES = ['crowd', 'walk', 'focus'];
const COLORS = 6;
const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

// ── 課表 ──
export function sanitizeCourse(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name ?? '').trim().slice(0, 50);
  const day = String(raw.day ?? '');
  const start = String(raw.start ?? ''), end = String(raw.end ?? '');
  if (!name || !/^[0-6]$/.test(day) || !TIME_RE.test(start) || !TIME_RE.test(end) || toMin(end) <= toMin(start)) return null;
  const color = Number.isInteger(raw.color) && raw.color >= 0 && raw.color < COLORS ? raw.color : hash(name) % COLORS;
  return { id: String(raw.id ?? uid()), day, start, end, name, building: BUILDINGS[raw.building] ? raw.building : '', color, ...(raw.demo ? { demo: true } : {}) };
}
export function sanitizeCourses(list) {
  const seen = new Set(), out = [];
  let dropped = 0;
  for (const r of Array.isArray(list) ? list : []) {
    const c = sanitizeCourse(r);
    if (!c) { dropped++; continue; }
    while (seen.has(c.id)) c.id = uid();
    seen.add(c.id); out.push(c);
  }
  return { courses: out, dropped };
}
// 找出與候選課程時間衝突的既有課程
export function findConflict(courses, cand, ignoreId = null) {
  return courses.find((x) => x.id !== ignoreId && String(x.day) === String(cand.day) && toMin(cand.start) < toMin(x.end) && toMin(cand.end) > toMin(x.start)) || null;
}
export const sortCourses = (list) => [...list].sort((a, b) => a.day - b.day || toMin(a.start) - toMin(b.start));

// ── 規劃設定 ──
export function taskState(text) {
  const tasks = parseTasks(text);
  return { tasks, order: tasks.map((t) => t.id), overrides: {}, scale: {}, deferred: [], done: {} };
}
export function defaultPlan(courses, text = DEMO_TEXT) {
  const days = [...new Set(courses.map((c) => +c.day))].sort();
  return { day: days[0] ?? 1, text, mode: 'crowd', win: { start: 540, end: 1020 }, buffer: 5, origin: '', ...taskState(text) };
}
const int = (v, a, b, d) => (Number.isFinite(+v) && +v >= a && +v <= b ? Math.round(+v) : d);
export function sanitizePlan(raw, courses) {
  const d = defaultPlan(courses);
  if (!raw || typeof raw !== 'object') return d;
  const text = typeof raw.text === 'string' ? raw.text.slice(0, 300) : d.text;
  const p = { ...d, ...taskState(text), text };
  p.day = int(raw.day, 0, 6, d.day);
  p.mode = MODES.includes(raw.mode) ? raw.mode : d.mode;
  const s = int(raw.win?.start, 0, 1439, 540), e = int(raw.win?.end, 1, 1440, 1020);
  p.win = s < e ? { start: s, end: e } : d.win;
  p.buffer = int(raw.buffer, 0, 30, 5);
  p.origin = raw.origin === '' || BUILDINGS[raw.origin] || PLACES[raw.origin] ? raw.origin ?? '' : '';
  // 只保留仍然有效的使用者操作
  const ids = new Set(p.tasks.map((t) => t.id));
  if (Array.isArray(raw.order) && raw.order.length === p.order.length && raw.order.every((i) => ids.has(i))) p.order = raw.order;
  for (const k of ['overrides']) if (raw[k] && typeof raw[k] === 'object') for (const [t, v] of Object.entries(raw[k])) if (ids.has(t) && PLACES[v]) p[k][t] = v;
  if (raw.scale && typeof raw.scale === 'object') for (const [t, v] of Object.entries(raw.scale)) if (ids.has(t) && v > 0 && v <= 1) p.scale[t] = +v;
  if (Array.isArray(raw.deferred)) p.deferred = raw.deferred.filter((i) => ids.has(i));
  if (raw.done && typeof raw.done === 'object') for (const [t, v] of Object.entries(raw.done)) if (ids.has(t) && v) p.done[t] = true;
  return p;
}

export const demoState = () => { const courses = demoCourses(); return { courses, plan: defaultPlan(courses), ui: { tab: 'home', exploreTab: 'places' }, demo: true }; };

// ── 載入 / 儲存 ──
export function loadState(storage = globalThis.localStorage) {
  const report = { migrated: false, dropped: 0, reset: false, corruptBackup: null, firstRun: false };
  const read = (key) => {
    try { const raw = storage.getItem(key); return raw == null ? { ok: true, value: null } : { ok: true, value: JSON.parse(raw), raw }; }
    catch { let raw = null; try { raw = storage.getItem(key); } catch { /* ignore */ } return { ok: false, raw }; }
  };
  let r = read(KEYS.state);
  if (!r.ok) { // 資料損壞：先備份原文，避免永久遺失
    const bk = `${KEYS.state}-corrupt-${Date.now()}`;
    try { if (r.raw) storage.setItem(bk, r.raw); report.corruptBackup = bk; } catch { /* ignore */ }
    report.reset = true; r = { ok: true, value: null };
  }
  let value = r.value && typeof r.value === 'object' && !Array.isArray(r.value) ? r.value : null;
  if (!value) { // 嘗試從 v1 遷移（保留使用者既有課表）
    const l = read(KEYS.legacy);
    if (l.ok && l.value && Array.isArray(l.value.courses) && l.value.courses.length) {
      const { courses, dropped } = sanitizeCourses(l.value.courses);
      report.migrated = courses.length > 0; report.dropped = dropped;
      if (courses.length) return { state: { courses, plan: defaultPlan(courses), ui: { tab: 'home', exploreTab: 'places' }, demo: false }, report };
    }
    report.firstRun = true;
    return { state: demoState(), report };
  }
  const { courses, dropped } = sanitizeCourses(value.courses);
  report.dropped = dropped;
  const ui = { tab: ['home', 'plan', 'schedule', 'explore', 'settings'].includes(value.ui?.tab) ? value.ui.tab : 'home', exploreTab: ['places', 'back', 'night', 'crowd'].includes(value.ui?.exploreTab) ? value.ui.exploreTab : 'places' };
  return { state: { courses, plan: sanitizePlan(value.plan, courses), ui, demo: courses.some((c) => c.demo) }, report };
}
export function saveState(state, storage = globalThis.localStorage) {
  try { storage.setItem(KEYS.state, JSON.stringify({ courses: state.courses, plan: state.plan, ui: state.ui })); return true; }
  catch { return false; }
}

// ── 人潮觀察紀錄 ──
export function sanitizeObs(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const ts = new Date(raw.timestamp);
  const crowd = Number(raw.crowd);
  const place = String(raw.place ?? '').trim().slice(0, 60);
  if (Number.isNaN(ts.getTime()) || !(crowd >= 1 && crowd <= 5) || !place) return null;
  const known = Object.values(PLACES).find((p) => p.id === raw.placeId || p.name === place);
  const queue = raw.queue === '' || raw.queue == null ? null : int(raw.queue, 0, 180, null);
  return {
    id: String(raw.id || `legacy-${ts.getTime()}-${index}`),
    timestamp: isoTW(ts), place, ...(known ? { placeId: known.id } : {}), crowd: Math.round(crowd),
    ...(queue != null ? { queue } : {}), method: raw.method === 'manual' ? 'manual' : 'onsite', note: String(raw.note ?? '').slice(0, 100),
  };
}
export function loadObservations(storage = globalThis.localStorage) {
  let list = [], dropped = 0;
  try {
    const x = JSON.parse(storage.getItem(KEYS.obs) || '[]');
    if (Array.isArray(x)) x.forEach((r, i) => { const o = sanitizeObs(r, i); if (o) list.push(o); else dropped++; });
  } catch { dropped = -1; }
  return { list, dropped };
}
export function saveObservations(list, storage = globalThis.localStorage) {
  try { storage.setItem(KEYS.obs, JSON.stringify(list)); return true; } catch { return false; }
}
const obsKey = (o) => `${o.timestamp}|${o.place}|${o.crowd}|${o.queue ?? ''}`;
export function addObservation(list, input) {
  const o = sanitizeObs({ ...input, id: uid(), timestamp: input.timestamp || new Date().toISOString() });
  return o ? { list: [...list, o], added: o } : { list, added: null };
}
export const deleteObservation = (list, id) => list.filter((o) => o.id !== id);

export const OBS_HEADER = ['id', '時間（台灣時間）', '地點', '地點代碼', '擁擠度（1-5）', '排隊分鐘', '觀察方式', '備註', 'timestamp'];
export function obsToCSV(list) {
  return toCSV(OBS_HEADER, list.map((o) => [o.id, fmtTW(o.timestamp), o.place, o.placeId || '', o.crowd, o.queue ?? '', o.method === 'manual' ? '事後紀錄' : '現場觀察', o.note || '', o.timestamp]));
}
// 匯入別人（或自己）匯出的 CSV：驗證每一列、略過重複，不會覆蓋既有資料
export function importObservationsCSV(list, text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { list, added: 0, skipped: 0, invalid: 0, error: '檔案沒有資料列' };
  const head = rows[0].map((h) => h.trim());
  const col = (...names) => head.findIndex((h) => names.includes(h));
  const iTs = col('timestamp'), iPlace = col('地點', 'place'), iCrowd = col('擁擠度（1-5）', 'crowd'), iQ = col('排隊分鐘', 'queue'), iM = col('觀察方式', 'method'), iN = col('備註', 'note'), iPid = col('地點代碼'), iId = col('id');
  if (iTs < 0 || iPlace < 0 || iCrowd < 0) return { list, added: 0, skipped: 0, invalid: 0, error: '欄位不符：需要 timestamp、地點、擁擠度' };
  const keys = new Set(list.map(obsKey)), ids = new Set(list.map((o) => o.id));
  let added = 0, skipped = 0, invalid = 0;
  const out = [...list];
  rows.slice(1).forEach((r, i) => {
    const m = iM >= 0 ? r[iM] : '';
    const o = sanitizeObs({ id: iId >= 0 ? r[iId] : '', timestamp: r[iTs], place: r[iPlace], placeId: iPid >= 0 ? r[iPid] : '', crowd: r[iCrowd], queue: iQ >= 0 ? r[iQ] : '', method: m === '事後紀錄' || m === 'manual' ? 'manual' : 'onsite', note: iN >= 0 ? r[iN] : '' }, i);
    if (!o) { invalid++; return; }
    if (keys.has(obsKey(o)) || ids.has(o.id)) { skipped++; return; }
    keys.add(obsKey(o)); ids.add(o.id); out.push(o); added++;
  });
  return { list: out, added, skipped, invalid, error: null };
}

// ── 清除（分開處理）──
export function clearCourses(state) { state.courses = []; state.demo = false; state.plan = defaultPlan([], state.plan.text); state.plan.day = new Date().getDay(); }
export function clearObservations(storage = globalThis.localStorage) { try { storage.removeItem(KEYS.obs); return true; } catch { return false; } }
export function clearAll(storage = globalThis.localStorage) { try { storage.removeItem(KEYS.state); storage.removeItem(KEYS.obs); return true; } catch { return false; } }

export const kindLabel = (k) => KINDS[k]?.label || k;
