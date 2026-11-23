// 人潮估計。資料來源分三類，介面上必須清楚區分：
//   observed  真實觀察：由團隊現場觀察紀錄推得
//   simulated 人工模擬：團隊設定的示範參數（基準值＋下課尖峰規則），未使用任何 Wi-Fi、選課或人流感測資料
//   model     模型預測：統計模型（engine/model.js），只有在某地點通過留一日驗證後才回傳
import { PLACES } from '../data/places.js';
import { nowTW, isoTW } from '../util.js';
import { evaluate, kernelPredict, MIN_SAMPLES as MODEL_MIN_SAMPLES } from './model.js';

export const SOURCE_LABEL = { observed: '觀察', simulated: '模擬', model: '模型', none: '無資料' };
export const MIN_SAMPLES = 3;      // 少於此筆數不使用觀察資料
export const FULL_WEIGHT_AT = 8;   // 達此筆數才完全採用觀察資料；之間與模擬值混合
const OBS_PCT = { 1: 10, 2: 30, 3: 50, 4: 70, 5: 90 };

// 下課尖峰係數：11:30 起升高，12:00–12:30 最高，之後緩降
const lunchPeak = (t) =>
  t < 690 ? 0.25 : t < 720 ? 0.25 + (0.75 * (t - 690)) / 30 : t < 750 ? 1 : t < 810 ? 1 - (0.7 * (t - 750)) / 60 : 0.3;

export const vacancy = (p, t) => Math.max(10, Math.round(p.vac - 3 * Math.max(0, t / 60 - 15)));
export const simulate = (p, t) => (p.vac != null ? 100 - vacancy(p, t) : Math.round(p.base + p.peak * lunchPeak(t)));
// 排隊分鐘：由模擬/觀察人潮推得的粗估（公式為人工設定，未經實測校準），取 5 分鐘為單位避免看似精確
export const queueMin = (pct) => (pct >= 70 ? Math.max(5, Math.round(((pct - 68) * 0.75) / 5) * 5) : 0);
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
  if (!m.has(place.id)) m.set(place.id, evaluate(samplesFor(place.id, observations), (min) => simulate(place, min)));
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
  if (place.nodata) return { pct: 50, source: 'none', n: 0, sufficiency: '不足', note: '自選地點，沒有人潮資料（以中性值 50% 排程）' };
  const sim = simulate(place, minute);
  const ev = observations.length >= MODEL_MIN_SAMPLES ? modelEval(place, observations) : null;
  if (ev?.status === 'ready' && day != null) {
    const k = kernelPredict(samplesFor(place.id, observations), day, minute, sim);
    if (k.weight >= 1) return { pct: Math.round(k.pct), source: 'model', n: ev.n, sufficiency: sufficiency(ev.n), note: `統計模型（核平滑回歸，${ev.n} 筆／${ev.dates} 天；留一日驗證 MAE ${ev.maeModel.toFixed(1)} 對模擬 ${ev.maeSim.toFixed(1)}）` };
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
