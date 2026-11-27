import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, reallocate, parseTasks, computeSlots } from '../src/engine/scheduler.js';
import { run, mk, course, assertValid, DEMO } from './helpers.js';

const DEMO_TEXT = '我想吃午餐、去圖書館讀書一小時，還要在五點前完成一份作業。';

test('需求解析：午餐、讀書 60 分、作業 17:00 前', () => {
  const t = parseTasks(DEMO_TEXT);
  assert.deepEqual(t.map((x) => x.kind), ['meal', 'study', 'homework']);
  assert.equal(t[1].dur, 60);
  assert.equal(t[2].deadline, 17 * 60);
});
test('需求解析：兩小時、3 點半前、30 分鐘', () => {
  const t = parseTasks('小組討論兩小時，3點半前寫完報告，行政大樓辦事30分鐘');
  assert.equal(t.find((x) => x.kind === 'group').dur, 120);
  assert.equal(t.find((x) => x.kind === 'homework').deadline, 15 * 60 + 30);
  assert.equal(t.find((x) => x.kind === 'errand').dur, 30);
});
test('空堂計算：兩堂課之間與課後', () => {
  const s = computeSlots(DEMO, 1, { start: 540, end: 1020 });
  assert.deepEqual(s.map((x) => [x.s, x.e]), [[710, 780], [890, 1020]]);
  assert.equal(s[0].prev, 'mgmt2'); assert.equal(s[0].next, 'eng5');
});

test('Demo 情境：全部排入、不重疊、午餐趕得上 13:00、作業 17:00 前完成', () => {
  const { ctx, plan } = run(DEMO_TEXT);
  assert.equal(plan.unscheduled.length, 0);
  assert.equal(plan.items.length, 3);
  assertValid(assert, plan, ctx);
  const [lunch, study, hw] = plan.items;
  assert.ok(lunch.end + lunch.walkOut + 5 <= 780);
  assert.equal(study.place.id, hw.place.id); // 連續任務留在同一地點
  assert.ok(hw.end <= 1020);
});
test('課程衝突：任何偏好模式都不會與課程重疊', () => {
  for (const mode of ['crowd', 'walk', 'focus']) {
    const { ctx, plan } = run(DEMO_TEXT + '，還要去行政大樓辦事', { mode });
    assertValid(assert, plan, ctx);
  }
});
test('多堂課的一天：任務不與任何課程、彼此重疊', () => {
  const courses = [course(1, '08:00', '10:00', 'mgmt2'), course(1, '11:00', '12:00', 'eng5'), course(1, '13:30', '15:00', 'zhixi'), course(1, '16:30', '18:00', 'eng5')];
  const { ctx, plan } = run('吃午餐，讀書一小時，寫作業，小組討論45分鐘', { courses, win: { start: 480, end: 1080 } });
  assertValid(assert, plan, ctx);
});
test('任務衝突：大量任務時彼此不重疊', () => {
  const { ctx, plan } = run('吃午餐，讀書三十分鐘，寫作業，小組討論，行政大樓辦事', { win: { start: 540, end: 1260 } });
  assertValid(assert, plan, ctx);
});
test('時間不足：明確說明原因與數字', () => {
  const { plan } = run(DEMO_TEXT + '，還要小組討論兩小時');
  assert.equal(plan.level, 'bad');
  const u = plan.unscheduled.find((x) => x.task.kind === 'group');
  assert.ok(u);
  assert.match(u.reason, /\d+ 分鐘|分鐘/);
  assert.ok(plan.warnings.some((w) => w.text.includes('排不進去')));
});
test('截止時間早於所有空堂：說明截止原因', () => {
  const { plan } = run('在十點前完成作業');
  assert.equal(plan.unscheduled.length, 1);
  assert.match(plan.unscheduled[0].reason, /截止時間/);
});
test('零緩衝：可行且比有緩衝多出整段緩衝時間（緩衝只計一次）', () => {
  // 用 90 分鐘的午間空堂：依團隊經驗，中午尖峰排隊較久，60 分鐘空堂加 10 分緩衝可能排不進去
  const courses = [course(1, '09:00', '12:00', 'mgmt2'), course(1, '13:30', '15:00', 'eng5')];
  const a = run('吃午餐', { buffer: 0, courses });
  const b = run('吃午餐', { buffer: 10, courses });
  assertValid(assert, a.plan, a.ctx); assertValid(assert, b.plan, b.ctx);
  assert.equal(a.plan.items[0].slack - b.plan.items[0].slack, 10);
});
test('緩衝在同一地點連續任務間不重複計算', () => {
  const { plan } = run('讀書一小時，寫作業', { courses: [], win: { start: 900, end: 1080 } });
  const [s, h] = plan.items;
  assert.equal(s.place.id, h.place.id);
  assert.equal(h.start, s.end); // 同地點無需移動，不插入緩衝
});
test('跨時段：午餐在中午空堂，其餘在下午空堂', () => {
  const { ctx, plan } = run(DEMO_TEXT);
  assertValid(assert, plan, ctx);
  assert.equal(plan.items[0].slotIndex, 0);
  assert.ok(plan.items.slice(1).every((i) => i.slotIndex === 1));
});
test('指定時間範圍：只在範圍內排程', () => {
  const { ctx, plan } = run('讀書一小時，寫作業', { win: { start: 900, end: 990 } });
  assertValid(assert, plan, ctx);
  assert.ok(plan.items.every((i) => i.end <= 990));
  assert.ok(plan.unscheduled.length >= 1);
});
test('出發地點：第一個空堂前沒有課時，以出發地點計步行', () => {
  const courses = [course(1, '12:00', '13:00', 'eng5')];
  const a = run('讀書三十分鐘', { courses, win: { start: 600, end: 720 }, origin: 'mainlib' });
  const b = run('讀書三十分鐘', { courses, win: { start: 600, end: 720 }, origin: 'mgmt2' });
  const pa = a.plan.items[0], pb = b.plan.items[0];
  assert.equal(pa.from, 'mainlib'); assert.equal(pb.from, 'mgmt2');
  assert.ok(pa.walkIn <= pb.walkIn);
});
test('行程依時間排序，且每個任務有地點、移動時間與理由所需欄位', () => {
  const { plan } = run(DEMO_TEXT);
  for (const it of plan.items) { assert.ok(it.place?.name); assert.ok(it.walkIn >= 0); assert.ok(it.dur > 0); }
  const starts = plan.items.map((i) => i.start);
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
});
test('偏好切換會改變推薦（避開人潮 vs 最短步行）', () => {
  const crowd = run('吃午餐', { mode: 'crowd' }).plan.items[0];
  const walkM = run('吃午餐', { mode: 'walk' }).plan.items[0];
  assert.notEqual(crowd.place.id, walkM.place.id);
  assert.ok(crowd.pct <= walkM.pct);
});
test('人潮來源可注入：觀察資料說某處很擠，排程會避開', () => {
  const base = run('吃午餐').plan.items[0].place.id;
  const crowd = (p, t) => ({ pct: p.id === base ? 95 : 30, source: 'observed', n: 9 });
  const { plan } = run('吃午餐', { crowd });
  assert.notEqual(plan.items[0].place.id, base);
  assert.equal(plan.items[0].src.source, 'observed');
});
test('重新調配：過載時延後放不下的任務，結果無衝突', () => {
  const ctx = mk(DEMO_TEXT + '，還要小組討論兩小時');
  const r = reallocate(ctx);
  const plan = buildPlan({ ...ctx, ...r });
  assert.equal(plan.unscheduled.length, 0);
  assert.ok(r.deferred.length >= 1);
  assertValid(assert, plan, { ...ctx, ...r });
});
test('彈性縮短：步行佔用時間時縮短讀書，作業仍準時完成', () => {
  const { plan } = run(DEMO_TEXT);
  const hw = plan.items.find((i) => i.task.kind === 'homework');
  assert.equal(hw.end, 1020);
  assert.ok(plan.items.find((i) => i.task.kind === 'study').shrunk > 0);
});
