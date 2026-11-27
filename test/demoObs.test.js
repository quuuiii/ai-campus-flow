import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDemoObs } from '../src/data/demoObs.js';
import { modelReport } from '../src/engine/crowd.js';
import { sanitizeObs } from '../src/store.js';

const TODAYS = ['2026-11-27T12:00:00+08:00', '2026-11-30T08:00:00+08:00', '2026-11-29T23:30:00+08:00', '2026-12-04T09:00:00+08:00'];

test('關閉＝沒有資料；每筆都標為示範、都在今天之前、日期是平日', () => {
  assert.deepEqual(generateDemoObs(0), []);
  for (const t of TODAYS) {
    const list = generateDemoObs(5, new Date(t));
    assert.ok(list.length > 0 && list.every((o) => o.demo === true && o.note === '示範資料' && o.id.startsWith('demo-')));
    assert.ok(list.every((o) => new Date(o.timestamp) < new Date(t)));
    const days = new Set(list.map((o) => new Date(o.timestamp).toLocaleDateString('en-US', { timeZone: 'Asia/Taipei', weekday: 'short' })));
    assert.ok(![...days].some((d) => d === 'Sat' || d === 'Sun'));
    assert.ok(list.every((o) => sanitizeObs(o)), '格式需能通過一般觀察驗證');
  }
});
test('固定亂數：同一天產生的資料完全相同', () => {
  const d = new Date(TODAYS[0]);
  assert.deepEqual(generateDemoObs(5, d), generateDemoObs(5, d));
});
test('展示進程：1、3 天資料不足；5 天「一致」情境不會宣稱模型更準；「假設差異」情境至少一地點可用；女十四舍維持不足', () => {
  for (const t of TODAYS) {
    const d = new Date(t);
    for (const sc of ['same', 'diff']) { assert.equal(modelReport(generateDemoObs(1, d, sc)).ready, 0); assert.equal(modelReport(generateDemoObs(3, d, sc)).ready, 0); }
    assert.equal(modelReport(generateDemoObs(5, d, 'same')).ready, 0, '資料與經驗一致時不應宣稱模型更準');
    const r5 = modelReport(generateDemoObs(5, d, 'diff'));
    assert.ok(r5.ready >= 1, t);
    assert.equal(r5.rows.find((x) => x.place.id === 'female14').status, 'insufficient');
  }
});
