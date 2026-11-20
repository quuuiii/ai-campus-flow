// 模型測試使用「合成資料」只為驗證程式行為，不代表任何真實觀察。
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, kernelPredict, MIN_SAMPLES } from '../src/engine/model.js';
import { modelReport, predictCrowd, simulate } from '../src/engine/crowd.js';
import { PLACES } from '../src/data/places.js';

let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const prior = (m) => simulate(PLACES.backdoor, m);
const synth = (truth, dates, perDate, noise) => {
  const out = [];
  for (let d = 0; d < dates; d++) for (let i = 0; i < perDate; i++) {
    const minute = 660 + Math.floor(rnd() * 180);
    out.push({ day: (d % 5) + 1, minute, pct: Math.max(10, Math.min(90, truth(minute) + (rnd() - 0.5) * noise)), date: `2026-11-${String(10 + d).padStart(2, '0')}` });
  }
  return out;
};

test('資料不足（筆數或天數）→ insufficient，不評估', () => {
  assert.equal(evaluate(synth(prior, 5, 2, 0), prior).status, 'insufficient'); // 10 筆
  assert.equal(evaluate(synth(prior, 2, 15, 0), prior).status, 'insufficient'); // 2 天
});

test('真實分佈與模擬不同（尖峰較晚）且資料充足 → ready，且 MAE 較低', () => {
  const truth = (m) => 30 + 55 * Math.exp(-0.5 * ((m - 780) / 30) ** 2); // 尖峰 13:00，模擬為 12:00
  const ev = evaluate(synth(truth, 6, 8, 6), prior);
  assert.equal(ev.status, 'ready', JSON.stringify(ev));
  assert.ok(ev.maeModel < ev.maeSim * 0.9);
});

test('資料與模擬一致時，模型不會被宣稱更好 → not-better', () => {
  const ev = evaluate(synth(prior, 6, 8, 2), prior);
  assert.equal(ev.status, 'not-better', JSON.stringify(ev));
});

test('純雜訊資料不會被標成 ready', () => {
  const ev = evaluate(synth(() => 50, 6, 8, 80), prior);
  assert.notEqual(ev.status, 'ready', JSON.stringify(ev));
});

test('kernelPredict：無樣本時回到先驗；樣本多時靠近樣本', () => {
  assert.equal(kernelPredict([], 1, 720, 60).pct, 60);
  const s = Array.from({ length: 30 }, () => ({ day: 1, minute: 720, pct: 20, date: 'd' }));
  assert.ok(kernelPredict(s, 1, 720, 90).pct < 30);
});

test('predictCrowd：模型 ready 才回傳 source=model，且附評估數字；否則不是 model', () => {
  const place = PLACES.backdoor;
  const mk = (list) => list.map((s, i) => ({ id: 'x' + i, timestamp: new Date(Date.UTC(2026, 10, 9 + (+s.date.slice(-2) - 10), 0, 0) + (s.minute - 480) * 60000).toISOString(), place: place.name, placeId: place.id, crowd: Math.max(1, Math.min(5, Math.round(s.pct / 20))) }));
  const truth = (m) => 30 + 55 * Math.exp(-0.5 * ((m - 780) / 30) ** 2);
  const good = mk(synth(truth, 6, 8, 4));
  const rep = modelReport(good);
  const row = rep.rows.find((r) => r.place.id === 'backdoor');
  assert.equal(row.status, 'ready', JSON.stringify({ ...row, place: undefined }));
  const p = predictCrowd(place, 780, good, 2); assert.equal(p.source, 'model'); assert.match(p.note, /MAE/);
  assert.notEqual(modelReport([]).mode, 'model');
  assert.equal(modelReport([]).mode, 'demo');
  assert.notEqual(predictCrowd(place, 780, [], 2).source, 'model');
});
test('MIN_SAMPLES 常數', () => assert.equal(MIN_SAMPLES, 20));
