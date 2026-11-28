import { test } from 'node:test';
import assert from 'node:assert/strict';
import { predictCrowd, bestTime, simulate, MIN_SAMPLES } from '../src/engine/crowd.js';
import { PLACES } from '../src/data/places.js';

const obs = (placeId, crowd, iso) => ({ id: Math.random().toString(), timestamp: iso, placeId, crowd });
// 2026-11-23 週一 12:10（台灣時間）
const t0 = '2026-11-23T12:10:00+08:00';

test('無觀察資料：回傳模擬值並明說資料不足', () => {
  const r = predictCrowd(PLACES.backdoor, 12 * 60 + 10, []);
  assert.equal(r.source, 'simulated'); assert.equal(r.pct, simulate(PLACES.backdoor, 730)); assert.equal(r.sufficiency, '不足');
});
test(`少於 ${MIN_SAMPLES} 筆：仍使用模擬值`, () => {
  const r = predictCrowd(PLACES.backdoor, 730, [obs('backdoor', 5, t0), obs('backdoor', 5, t0)], 1);
  assert.equal(r.source, 'simulated'); assert.equal(r.n, 2);
});
test('3–7 筆觀察：來源為「混合估計」（觀察與模擬加權）', () => {
  const o = Array.from({ length: 4 }, () => obs('backdoor', 1, t0));
  const r = predictCrowd(PLACES.backdoor, 730, o, 1);
  assert.equal(r.source, 'blended'); assert.ok(r.pct < simulate(PLACES.backdoor, 730)); assert.ok(r.pct > 10);
  assert.match(r.note, /混合/);
});
test('資料充足：完全採用觀察值', () => {
  const o = Array.from({ length: 8 }, () => obs('backdoor', 1, t0));
  const r = predictCrowd(PLACES.backdoor, 730, o, 1);
  assert.equal(r.pct, 10); assert.equal(r.source, 'observed');
});
test('五種來源標籤與擁擠度文字（不稱空位率）', async () => {
  const { SOURCE_LABEL, crowdText } = await import('../src/engine/crowd.js');
  assert.deepEqual(Object.values(SOURCE_LABEL), ['模擬', '真實觀察', '混合估計', '模型預測', '無資料']);
  assert.equal(crowdText(90), '擁擠度 5/5（爆滿）'); assert.equal(crowdText(50), '擁擠度 3/5（普通）'); assert.equal(crowdText(60), '擁擠度 3.5/5（擠）');
});
test('只使用同地點、前後一小時內的觀察', () => {
  const o = Array.from({ length: 6 }, () => obs('female14', 1, t0)).concat(Array.from({ length: 6 }, () => obs('backdoor', 1, '2026-11-23T16:00:00+08:00')));
  assert.equal(predictCrowd(PLACES.backdoor, 730, o, 1).source, 'simulated');
});
test('舊格式紀錄（只有地點名稱）也能對應到地點', () => {
  const o = Array.from({ length: 8 }, () => ({ id: 'x', timestamp: t0, place: PLACES.backdoor.name, crowd: 5 }));
  assert.equal(predictCrowd(PLACES.backdoor, 730, o, 1).pct, 90);
});
test('建議前往時間：找出人潮最低的時段', () => {
  const b = bestTime(PLACES.backdoor, 11 * 60, 14 * 60, []);
  assert.ok(b.minute === 11 * 60 || b.minute >= 13 * 60 + 15);
});
