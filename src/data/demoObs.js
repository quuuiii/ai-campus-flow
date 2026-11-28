// 示範資料集：依「團隊經驗設定」（data/places.js 的時段等級）加上隨機誤差產生的觀察資料，只用於展示資料累積的流程。
// 這些不是任何人的真實觀察：一律帶 demo: true，介面標示「示範資料」，永不上傳團隊資料庫。
import { PLACES } from './places.js';
import { isoTW } from '../util.js';
import { simulate } from '../engine/crowd.js';

export const DEMO_DAY_OPTIONS = [0, 1, 3, 5];
// 情境：same＝觀察與團隊經驗一致；diff＝假設情境，觀察到的尖峰比團隊經驗晚約 30 分鐘（用來展示模型能修正經驗）
export const DEMO_SCENARIOS = { same: '觀察與經驗一致', diff: '假設：尖峰比經驗晚 30 分' };
export const DIFF_SHIFT = 30;
// 每天各地點筆數與時段；女十四舍刻意只有少量資料，用來對照「資料不足」
const PLAN = {
  backdoor: { perDay: 6, from: 660, to: 1140 },
  pinecone: { perDay: 6, from: 690, to: 810 },
  male9_711: { perDay: 6, from: 690, to: 1080 },
  mainlib: { perDay: 6, from: 600, to: 1140 },
  nightmarket: { perDay: 6, from: 660, to: 1140 },
  zhongzheng: { perDay: 6, from: 600, to: 1140 },
  female14: { perDay: 1, from: 700, to: 1060 },
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

export function generateDemoObs(days, today = new Date(), scenario = 'same') {
  const shift = scenario === 'diff' ? DIFF_SHIFT : 0;
  if (!(days > 0)) return [];
  let seed = 20261127; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const dates = pastWeekdays(5, today).slice(0, days), out = [];
  dates.forEach((date, di) => {
    const wd = new Date(date + 'T12:00:00+08:00').getUTCDay();
    for (const [pid, p] of Object.entries(PLAN)) {
      for (let i = 0; i < p.perDay; i++) {
        const minute = Math.round(p.from + ((i + rnd()) / p.perDay) * (p.to - p.from));
        const pct = Math.max(5, Math.min(95, simulate(PLACES[pid], minute - shift, wd) + (rnd() - 0.5) * 24));
        const crowd = Math.max(1, Math.min(5, Math.round((pct - 10) / 20) + 1));
        const hh = String(Math.floor(minute / 60)).padStart(2, '0'), mm = String(minute % 60).padStart(2, '0');
        out.push({ id: `demo-${scenario}-${di}-${pid}-${i}`, timestamp: new Date(`${date}T${hh}:${mm}:00+08:00`).toISOString(), place: PLACES[pid].name, placeId: pid, crowd, method: 'onsite', note: '示範資料', demo: true });
      }
    }
  });
  return out;
}
