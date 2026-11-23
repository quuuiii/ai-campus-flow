import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequest, cnNum } from '../src/engine/scheduler.js';
const T = (s) => parseRequest(s).tasks.map((t) => [t.kind, t.dur, t.deadline ?? null]);

test('中文數字', () => {
  for (const [a, b] of [['十', 10], ['十五', 15], ['二十', 20], ['二十五', 25], ['兩', 2], ['九十', 90], ['1.5', 1.5], ['十十', null], ['abc', null]]) assert.equal(cnNum(a), b, a);
});
test('題目中的五句自然語言', () => {
  assert.deepEqual(T('我中午想吃飯，下午兩點前要完成報告。'), [['meal', 30, null], ['homework', 60, 840]]);
  assert.deepEqual(T('我想去圖書館讀書兩小時。'), [['study', 120, null]]);
  assert.deepEqual(T('我三點半之前要去行政大樓。'), [['errand', 30, 930]]);
  assert.deepEqual(T('我想和組員討論專題一個半小時。'), [['group', 90, null]]);
  const r = parseRequest('我今天只有一小時空堂，幫我安排最重要的事情。');
  assert.equal(r.tasks.length, 0); assert.equal(r.unknown.length, 2, '看不懂的片段必須回報');
});
test('分鐘、時刻、上下午', () => {
  assert.deepEqual(T('讀書十五分鐘'), [['study', 15, null]]);
  assert.deepEqual(T('讀書二十分鐘'), [['study', 20, null]]);
  assert.deepEqual(T('14:30前印講義'), [['errand', 30, 870]]);
  assert.deepEqual(T('晚上九點前交作業'), [['homework', 60, 1260]]);
  assert.deepEqual(T('上午十一點前交作業'), [['homework', 60, 660]]);
});
test('推測上下午時給提示', () => {
  const r = parseRequest('五點前完成作業');
  assert.equal(r.tasks[0].deadline, 1020); assert.equal(r.notes.length, 1);
});
test('無法理解 → unknown，不會默默丟掉', () => assert.deepEqual(parseRequest('我想打球').unknown, ['我想打球']));
