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
import { buildPlan } from '../src/engine/scheduler.js';
test('指定地點與時段：後門午餐、晚上六點到九點讀書', () => {
  const r = parseRequest('我想吃後門午餐、晚上六點到九點去讀書');
  assert.equal(r.tasks[0].place, 'backdoor');
  assert.deepEqual([r.tasks[1].window, r.tasks[1].dur, r.tasks[1].deadline], [[1080, 1260], 180, 1260]);
  const courses = [{ id: 'a', day: '1', start: '13:00', end: '15:50', building: 'mgmt2', name: '組織行為' }];
  // 先不延長：讀書超出規劃範圍 → 不排、回報 extendTo 讓介面詢問
  const p0 = buildPlan({ courses, day: 1, win: { start: 540, end: 1020 }, tasks: r.tasks, order: r.tasks.map((t) => t.id), mode: 'walk' });
  assert.equal(p0.win.end, 1020, '不可自動延長');
  assert.deepEqual(p0.extendTo, { start: 540, end: 1260, tasks: ['study1'] });
  assert.ok(p0.unscheduled[0].outOfRange);
  // 使用者同意延長後
  const p = buildPlan({ courses, day: 1, win: { start: 540, end: 1260 }, tasks: r.tasks, order: r.tasks.map((t) => t.id), mode: 'walk' });
  assert.equal(p.unscheduled.length, 0);
  assert.equal(p.items.find((i) => i.task.kind === 'meal').place.id, 'backdoor', '最短步行模式也要去指定的後門');
  const st = p.items.find((i) => i.task.kind === 'study');
  assert.ok(st.start >= 1080 && st.end <= 1260 && st.end - st.start >= 144);
});
test('時段解析：各種寫法', () => {
  const W = (s) => parseRequest(s).tasks[0].window;
  assert.deepEqual(W('下午一點到五點讀書'), [780, 1020]);
  assert.deepEqual(W('18:00-21:00 讀書'), [1080, 1260]);
  assert.deepEqual(W('晚上六點半到九點讀書'), [1110, 1260]);
  assert.deepEqual(W('晚上讀書'), [1080, 1320]);
  assert.deepEqual(W('上午十點到十二點讀書'), [600, 720]);
});
test('地點解析：對應正確；不適合的地點會提醒', () => {
  const P = (s) => parseRequest(s).tasks[0].place;
  assert.equal(P('在宵夜街吃'), 'nightmarket'); assert.equal(P('松果吃午餐'), 'pinecone'); assert.equal(P('女十四吃飯'), 'female14');
  assert.equal(P('7-11 吃午餐'), 'male9_711'); assert.equal(P('去總圖讀書'), 'mainlib'); assert.equal(P('K書中心讀書'), 'zhongzheng');
  assert.equal(P('去圖書館讀書'), undefined, '「圖書館」太籠統，不指定');
  const r = parseRequest('去7-11讀書'); assert.equal(r.tasks[0].place, undefined); assert.equal(r.notes.length, 1);
});
test('指定的地點休息時不偷換地點，並說明原因', () => {
  const t = parseRequest('松果吃午餐').tasks;
  const p = buildPlan({ courses: [], day: 6, win: { start: 540, end: 1020 }, tasks: t, order: t.map((x) => x.id) });
  assert.equal(p.items.length, 0); assert.match(p.unscheduled[0].reason, /松果這天沒有營業/);
});

test('使用者指定的用餐時間與時長不被地點預設覆蓋', () => {
  const T = (s) => parseRequest(s).tasks[0];
  assert.deepEqual(T('十二點半吃午餐').window, [750, 810]);
  assert.deepEqual(T('晚上七點吃晚餐').window, [1140, 1200]);
  const t = parseRequest('在後門吃午餐一小時').tasks;
  const p = buildPlan({ courses: [], day: 2, win: { start: 540, end: 1020 }, tasks: t, order: t.map((x) => x.id) });
  assert.equal(p.items[0].end - p.items[0].start, 60, '後門預設吃 30 分，但使用者說一小時');
  const t2 = parseRequest('十二點半吃午餐').tasks;
  const p2 = buildPlan({ courses: [], day: 2, win: { start: 540, end: 1020 }, tasks: t2, order: t2.map((x) => x.id) });
  assert.ok(p2.items[0].arrive >= 750 && p2.items[0].start <= 780, '在 12:30 抵達、30 分鐘內開始');
});
test('營業時間未確認：晚上優先排有晚間資料的地點，未確認的會被標示', () => {
  const t = parseRequest('晚上七點吃晚餐').tasks;
  const p = buildPlan({ courses: [], day: 2, win: { start: 540, end: 1320 }, tasks: t, order: t.map((x) => x.id) });
  assert.ok(['backdoor', 'nightmarket'].includes(p.items[0].place.id));
  assert.ok(!p.items[0].unconfirmed);
  const t2 = parseRequest('晚上七點在松果吃晚餐').tasks;
  const p2 = buildPlan({ courses: [], day: 2, win: { start: 540, end: 1320 }, tasks: t2, order: t2.map((x) => x.id) });
  assert.equal(p2.items[0].place.id, 'pinecone'); assert.ok(p2.items[0].unconfirmed, '使用者指定時照排，但標示未確認');
});
