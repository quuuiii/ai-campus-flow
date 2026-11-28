// 團隊資料儀表板統計（純函式）：總筆數、各地點樣本、星期×時段分布、缺資料地點、最近更新、模型門檻
import { PLACES } from '../data/places.js';
import { nowTW, isoTW } from '../util.js';
import { obsPlaceId } from './crowd.js';
import { MIN_SAMPLES, MIN_DATES } from './model.js';

export const BANDS = [
  { id: 'am', label: '早上', s: 0, e: 660 },      // < 11:00
  { id: 'lunch', label: '午餐', s: 660, e: 840 }, // 11:00–14:00
  { id: 'pm', label: '下午', s: 840, e: 1020 },   // 14:00–17:00
  { id: 'eve', label: '晚上', s: 1020, e: 1440 }, // ≥ 17:00
];
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function dashboardStats(observations) {
  const places = Object.values(PLACES).filter((p) => !p.nodata);
  const per = Object.fromEntries(places.map((p) => [p.id, { place: p, n: 0, dates: new Set(), last: null, byDay: [0, 0, 0, 0, 0, 0, 0] }]));
  const grid = Object.fromEntries(DAY_ORDER.map((d) => [d, Object.fromEntries(BANDS.map((b) => [b.id, 0]))]));
  let last = null, unknown = 0;
  for (const o of observations) {
    const t = new Date(o.timestamp);
    if (Number.isNaN(t.getTime())) continue;
    const id = obsPlaceId(o), row = per[id];
    if (!row) { unknown++; continue; }
    const tw = nowTW(t), date = isoTW(t).slice(0, 10);
    row.n++; row.dates.add(date); row.byDay[tw.day]++;
    if (!row.last || t > row.last) row.last = t;
    if (!last || t > last) last = t;
    const band = BANDS.find((b) => tw.minute >= b.s && tw.minute < b.e);
    grid[tw.day][band.id]++;
  }
  const rows = places.map((p) => {
    const r = per[p.id], dates = r.dates.size;
    return { place: p, n: r.n, dates, byDay: r.byDay, last: r.last, meetsMin: r.n >= MIN_SAMPLES && dates >= MIN_DATES, needN: Math.max(0, MIN_SAMPLES - r.n), needDates: Math.max(0, MIN_DATES - dates) };
  });
  const max = Math.max(1, ...DAY_ORDER.flatMap((d) => BANDS.map((b) => grid[d][b.id])));
  return {
    total: rows.reduce((a, r) => a + r.n, 0), unknown, rows, grid, max, last,
    missing: rows.filter((r) => r.n === 0).map((r) => r.place),
    readyForTraining: rows.filter((r) => r.meetsMin).length,
  };
}

// 組員資料蒐集缺口（只用真實紀錄，不含示範）：每個地點 × 平日四個時段 ＋ 週末，各需 target 筆
export const GAP_TARGET = 5;
export function collectionGaps(observations, target = GAP_TARGET) {
  const real = observations.filter((o) => !o.demo);
  const places = Object.values(PLACES).filter((p) => !p.nodata);
  const cols = [...BANDS.map((b) => ({ id: b.id, label: '平日' + b.label, band: b })), { id: 'weekend', label: '週末', band: null }];
  const grid = Object.fromEntries(places.map((p) => [p.id, Object.fromEntries(cols.map((c) => [c.id, 0]))]));
  for (const o of real) {
    const id = obsPlaceId(o); if (!grid[id]) continue;
    const t = new Date(o.timestamp); if (Number.isNaN(t.getTime())) continue;
    const tw = nowTW(t);
    if (tw.day === 0 || tw.day === 6) grid[id].weekend++;
    else grid[id][BANDS.find((b) => tw.minute >= b.s && tw.minute < b.e).id]++;
  }
  const cells = places.flatMap((p) => cols.map((c) => ({ place: p, col: c, n: grid[p.id][c.id], need: Math.max(0, target - grid[p.id][c.id]) })));
  // 優先：缺最多、且是該地點主要時段（用餐地點的午餐、晚上；讀書地點的下午、晚上）
  const main = (p, c) => (p.kinds.includes('meal') ? ['lunch', 'eve'] : ['pm', 'eve']).includes(c.id);
  const todo = cells.filter((x) => x.need > 0).sort((a, b) => (main(b.place, b.col) - main(a.place, a.col)) || b.need - a.need).slice(0, 6);
  return { places, cols, grid, target, todo, real: real.length, filled: cells.filter((x) => x.need === 0).length, total: cells.length };
}
