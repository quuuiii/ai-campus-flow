// 人潮估計。資料來源分三類，介面上必須清楚區分：
//   observed  真實觀察：由團隊現場觀察紀錄推得
//   simulated 人工模擬：依團隊成員使用經驗設定的時段等級（data/places.js），非實測；未使用任何 Wi-Fi、選課或人流感測資料
//   model     模型預測：統計模型（engine/model.js），只有在某地點通過留一日驗證後才回傳
import { PLACES } from '../data/places.js';
import { nowTW, isoTW } from '../util.js';
import { evaluate, kernelPredict, MIN_SAMPLES as MODEL_MIN_SAMPLES } from './model.js';

export const SOURCE_LABEL = { observed: '觀察', simulated: '模擬', model: '模型', none: '無資料' };
export const MIN_SAMPLES = 3;      // 少於此筆數不使用觀察資料
export const FULL_WEIGHT_AT = 8;   // 達此筆數才完全採用觀察資料；之間與模擬值混合
const OBS_PCT = { 1: 10, 2: 30, 3: 50, 4: 70, 5: 90 };

// 依團隊經驗折線計算等級，再轉成百分比（1→10%、2→30%、3→50%、4→70%、5→90%）
const lerp = (knots, t) => {
  if (t <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) if (t <= knots[i][0]) { const [t0, v0] = knots[i - 1], [t1, v1] = knots[i]; return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0); }
  return knots[knots.length - 1][1];
};
export const levelToPct = (lv) => Math.round((Math.max(1, Math.min(5, lv)) - 1) * 20 + 10);
export function simLevel(p, t, day = 1) {
  const pr = p.profile; if (!pr) return 3;
  const weekend = day === 0 || day === 6;
  let lv = lerp(weekend && pr.weekend ? pr.weekend : pr.weekday, t);
  for (const a of pr.adj?.[day] || []) if ((a.from == null || t >= a.from) && (a.to == null || t < a.to)) lv += a.delta;
  return Math.max(1, Math.min(5, lv));
}
export const isClosed = (p, day) => day != null && !!p.closed?.includes(day);
// day 未知時以平日（週一）計算
export const simulate = (p, t, day = null) => levelToPct(simLevel(p, t, day ?? 1));
// 排隊分鐘：以該地點平日「最空等級 → 最擠等級」為範圍，把人潮換算成 0 → 尖峰排隊分鐘（團隊經驗）；取 5 分鐘為單位
export function queueMin(pct, place = null) {
  const peak = place?.queuePeak ?? 15, knots = place?.profile?.weekday;
  const lo = knots ? levelToPct(Math.min(...knots.map((k) => k[1]))) : 50;
  const hi = knots ? levelToPct(Math.max(...knots.map((k) => k[1]))) : 90;
  const r = hi > lo ? Math.max(0, Math.min(1, (pct - lo) / (hi - lo))) : 0;
  const q = peak * r;
  return q < 2.5 ? 0 : Math.max(5, Math.round(q / 5) * 5);
}
// 顯示用：人潮百分比取 5% 為單位
export const approx = (pct) => Math.round(pct / 5) * 5;
export const levelOf = (pct) => (pct >= 70 ? '高' : pct >= 40 ? '中' : '低');
export const sufficiency = (n) => (n < MIN_SAMPLES ? '不足' : n < FULL_WEIGHT_AT ? '偏少' : n < 16 ? '尚可' : '充足');

export const obsPlaceId = (o) => o.placeId || Object.values(PLACES).find((p) => p.name === o.place)?.id || null;

// ── 統計模型（通過留一日驗證的地點才啟用）──
const cache = new WeakMap();
export function samplesFor(placeId, observations) {
  const out = [];
  for (const o of observations) {
    if (obsPlaceId(o) !== placeId || !OBS_PCT[o.crowd]) continue;
    const t = nowTW(new Date(o.timestamp));
    if (Number.isNaN(t.minute)) continue;
    out.push({ day: t.day, minute: t.minute, pct: OBS_PCT[o.crowd], date: isoTW(new Date(o.timestamp)).slice(0, 10) }); // 以台灣日期分組，避免同一天被切進不同驗證折
  }
  return out;
}
export function modelEval(place, observations) {
  let m = cache.get(observations);
  if (!m) { m = new Map(); cache.set(observations, m); }
  if (!m.has(place.id)) m.set(place.id, evaluate(samplesFor(place.id, observations), (min, d) => simulate(place, min, d)));
  return m.get(place.id);
}
// 各地點模型狀態；mode：demo＝無任何地點通過驗證（全部為模擬／混合），partial／model
export function modelReport(observations = []) {
  const rows = Object.values(PLACES).filter((p) => !p.nodata).map((p) => ({ place: p, ...modelEval(p, observations) }));
  const ready = rows.filter((r) => r.status === 'ready').length;
  return { rows, ready, mode: ready === 0 ? 'demo' : ready === rows.length ? 'model' : 'partial', minSamples: MODEL_MIN_SAMPLES };
}

// 預測某地點在 (星期, 分鐘) 的人潮。資料不足時回傳透明的「模擬」值。
export function predictCrowd(place, minute, observations = [], day = null) {
  if (place.nodata) return { pct: 50, source: 'none', n: 0, sufficiency: '不足', note: place.id === 'self' ? '自選地點，沒有人潮資料（以中性值 50% 排程）' : '此地點未蒐集人潮資料（以中性值 50% 排程）' };
  const sim = simulate(place, minute, day);
  const ev = observations.length >= MODEL_MIN_SAMPLES ? modelEval(place, observations) : null;
  if (ev?.status === 'ready' && day != null) {
    const k = kernelPredict(samplesFor(place.id, observations).map((x) => ({ ...x, prior: simulate(place, x.minute, x.day) })), day, minute, sim);
    if (k.weight >= 1) return { pct: Math.round(k.pct), source: 'model', n: ev.n, sufficiency: sufficiency(ev.n), note: `統計模型（以團隊經驗為基準的殘差修正，${ev.n} 筆／${ev.dates} 天；留一日驗證 MAE ${ev.maeModel.toFixed(1)} 對模擬 ${ev.maeSim.toFixed(1)}）` };
  }
  let wSum = 0, vSum = 0, n = 0;
  for (const o of observations) {
    if (obsPlaceId(o) !== place.id || !OBS_PCT[o.crowd]) continue;
    const t = nowTW(new Date(o.timestamp));
    if (Number.isNaN(t.minute) || Math.abs(t.minute - minute) > 60) continue;
    const w = day != null && t.day === day ? 2 : 1;
    wSum += w; vSum += w * OBS_PCT[o.crowd]; n++;
  }
  if (n < MIN_SAMPLES) {
    return { pct: sim, source: 'simulated', n, sufficiency: '不足', note: n ? `僅 ${n} 筆觀察，資料不足，使用模擬值` : '尚無觀察資料，使用模擬值' };
  }
  const obsAvg = vSum / wSum;
  const k = Math.min(1, n / FULL_WEIGHT_AT); // 透明的收縮估計：樣本少就向模擬值靠攏
  const pct = Math.round(k * obsAvg + (1 - k) * sim);
  return { pct, source: 'observed', n, sufficiency: sufficiency(n), note: k < 1 ? `${n} 筆觀察，與模擬值混合（觀察權重 ${Math.round(k * 100)}%）` : `${n} 筆觀察的加權平均` };
}

// 在 [from, to] 內找人潮最低的時間（每 15 分鐘取樣）
export function bestTime(place, from, to, observations = [], day = null) {
  let best = null;
  for (let t = from; t <= to; t += 15) {
    const p = predictCrowd(place, t, observations, day);
    if (!best || p.pct < best.pct) best = { minute: t, ...p };
  }
  return best;
}

export const defaultCrowdFn = (observations = [], day = null) => (place, minute) => predictCrowd(place, minute, observations, day);
