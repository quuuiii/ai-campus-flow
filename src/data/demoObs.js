// 示範資料集：用固定亂數「產生」的觀察資料，只用於展示資料累積如何讓模型啟用。
// 這些不是任何人的真實觀察：一律帶 demo: true，介面標示「示範資料」，永不上傳團隊資料庫。
// 產生規則（示範假設）：後門午餐尖峰比模擬規則晚約 20 分鐘；總圖下午較擁擠；女十四舍只有少量資料（用來對照「資料不足」）。
import { PLACES } from './places.js';
import { isoTW } from '../util.js';

export const DEMO_DAY_OPTIONS = [0, 1, 3, 5];
const gauss = (t, c, w) => Math.exp(-0.5 * ((t - c) / w) ** 2);
const PATTERNS = {
  backdoor: { perDay: 6, from: 660, to: 840, pct: (t) => 28 + 58 * gauss(t, 770, 28) },
  mainlib: { perDay: 6, from: 600, to: 1020, pct: (t) => 25 + 0.07 * (t - 600) },
  female14: { perDay: 1, from: 690, to: 780, pct: (t) => 35 + 30 * gauss(t, 735, 30) },
};

// 往前找 n 個平日（台灣日期），不含今天
function pastWeekdays(n, today) {
  const out = []; let d = new Date(today.getTime());
  while (out.length < n) {
    d = new Date(d.getTime() - 86400000);
    const tw = isoTW(d).slice(0, 10), wd = new Date(tw + 'T12:00:00+08:00').getUTCDay();
    if (wd >= 1 && wd <= 5) out.push(tw);
  }
  return out.reverse();
}

export function generateDemoObs(days, today = new Date()) {
  if (!(days > 0)) return [];
  let seed = 20261127; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const dates = pastWeekdays(5, today).slice(0, days), out = [];
  dates.forEach((date, di) => {
    for (const [pid, p] of Object.entries(PATTERNS)) {
      for (let i = 0; i < p.perDay; i++) {
        const minute = Math.round(p.from + ((i + rnd()) / p.perDay) * (p.to - p.from));
        const pct = Math.max(5, Math.min(95, p.pct(minute) + (rnd() - 0.5) * 16));
        const crowd = Math.max(1, Math.min(5, Math.round(pct / 20 + 0.5)));
        const hh = String(Math.floor(minute / 60)).padStart(2, '0'), mm = String(minute % 60).padStart(2, '0');
        out.push({ id: `demo-${di}-${pid}-${i}`, timestamp: new Date(`${date}T${hh}:${mm}:00+08:00`).toISOString(), place: PLACES[pid].name, placeId: pid, crowd, method: 'onsite', note: '示範資料', demo: true });
      }
    }
  });
  return out;
}
