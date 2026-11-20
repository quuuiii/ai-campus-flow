// 人潮預測的統計模型（核平滑回歸 + 向模擬先驗收縮）與誠實評估。純函式，不依賴 UI 或儲存。
// 這是簡單的統計模型，不是深度學習；只有通過下列驗證的地點才會被標為「模型」。
export const BANDWIDTH = 45;      // 時間核寬（分鐘）
export const PRIOR_WEIGHT = 1.5;  // 先驗（模擬值）相當於幾筆樣本的權重
export const MIN_SAMPLES = 20;    // 地點至少幾筆觀察才進行評估
export const MIN_DATES = 3;       // 至少幾個不同日期（用於留一日驗證）
export const REQUIRED_GAIN = 0.9; // 模型 MAE 必須 ≤ 模擬基準 MAE 的 90% 才算有幫助

// samples: [{day:0-6, minute, pct, date:'YYYY-MM-DD'}]；prior: (minute) => 模擬人潮%
export function kernelPredict(samples, day, minute, priorPct, { bw = BANDWIDTH, k0 = PRIOR_WEIGHT } = {}) {
  let w = 0, v = 0;
  for (const s of samples) {
    const dm = s.minute - minute;
    const wt = Math.exp(-0.5 * (dm / bw) ** 2) * (s.day === day ? 1 : 0.5);
    w += wt; v += wt * s.pct;
  }
  return { pct: (v + k0 * priorPct) / (w + k0), weight: w };
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

// 留一日驗證：每次把某一天的樣本全部拿掉再預測，避免同一天相鄰樣本造成的樂觀估計
export function evaluate(samples, prior) {
  const n = samples.length, dates = [...new Set(samples.map((s) => s.date))];
  const base = { n, dates: dates.length, maeModel: null, maeSim: null, maeMean: null };
  if (n < MIN_SAMPLES) return { ...base, status: 'insufficient', reason: `觀察 ${n} 筆，至少需要 ${MIN_SAMPLES} 筆` };
  if (dates.length < MIN_DATES) return { ...base, status: 'insufficient', reason: `僅涵蓋 ${dates.length} 天，至少需要 ${MIN_DATES} 天` };
  const eM = [], eS = [], eB = [];
  for (const d of dates) {
    const train = samples.filter((s) => s.date !== d), test = samples.filter((s) => s.date === d);
    if (!train.length) continue;
    const mu = mean(train.map((s) => s.pct));
    for (const s of test) {
      const sim = prior(s.minute);
      eM.push(Math.abs(kernelPredict(train, s.day, s.minute, sim).pct - s.pct));
      eS.push(Math.abs(sim - s.pct));
      eB.push(Math.abs(mu - s.pct));
    }
  }
  const r = { ...base, maeModel: mean(eM), maeSim: mean(eS), maeMean: mean(eB) };
  if (r.maeModel <= REQUIRED_GAIN * r.maeSim && r.maeModel <= r.maeMean) return { ...r, status: 'ready', reason: '留一日驗證：誤差低於模擬基準與全體平均基準' };
  return { ...r, status: 'not-better', reason: '留一日驗證：未明顯優於模擬基準，仍使用模擬／觀察混合' };
}
