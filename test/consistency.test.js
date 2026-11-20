// Planner 一致性稽核：時間、步行、排隊、緩衝與推薦理由必須互相吻合；不得顯示與內部資料不符的數字。
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, explain, reallocate } from '../src/engine/scheduler.js';
import { approx, queueMin } from '../src/engine/crowd.js';
import { walk } from '../src/data/places.js';
import { mk, assertValid, course } from './helpers.js';

const TEXTS = [
  '我想吃午餐、去圖書館讀書一小時，還要在五點前完成一份作業。',
  '吃午餐，讀書30分鐘',
  '吃午餐、小組討論1小時、去行政大樓辦事',
  '我想吃午餐、去圖書館讀書一小時，還要在五點前完成一份作業，再幫我加一場兩小時的小組討論',
];
const origins = ['', 'mainlib', 'backdoor'];
const scenarios = [];
for (const text of TEXTS) for (const mode of ['crowd', 'walk', 'focus']) for (const buffer of [0, 5, 10]) for (const origin of origins)
  for (const win of [{ start: 540, end: 1020 }, { start: 600, end: 1200 }]) scenarios.push({ text, over: { mode, buffer, origin, win } });

test(`一致性：${scenarios.length} 種情境（時間/步行/排隊/緩衝/理由）`, () => {
  for (const { text, over } of scenarios) {
    const ctx = mk(text, over);
    const plan = buildPlan(ctx);
    assertValid(assert, plan, ctx);
    let walkSum = 0;
    for (const it of plan.items) {
      const tag = `${text}|${JSON.stringify(over)}|${it.task.id}`;
      // 步行分鐘與資料表一致
      assert.equal(it.walkIn, walk(it.from, it.place.id), `walkIn 與步行表不符 ${tag}`);
      if (it.slot.next) assert.equal(it.walkOut, walk(it.place.id, it.slot.next), `walkOut 不符 ${tag}`);
      // 開始時間 ≥ 抵達時間 + 排隊
      assert.ok(it.start >= it.arrive + it.queue, `開始早於抵達+排隊 ${tag}`);
      assert.equal(it.queue, queueMin(it.pct), `排隊與人潮不符 ${tag}`);
      assert.ok(it.queue === 0 || it.queue % 5 === 0, '排隊分鐘應為 5 的倍數');
      // 緩衝
      if (it.slack != null) assert.equal(it.slack, it.slot.e - (it.end + it.walkOut) - ctx.buffer, `緩衝計算不符 ${tag}`);
      walkSum += it.walkIn + it.walkOut;
      // 理由中的數字必須等於卡片資料
      const text1 = explain(it).join('\n');
      if (it.task.kind === 'meal' || it.task.kind === 'errand') assert.ok(text1.includes(`人潮約 ${approx(it.pct)}%`), `理由人潮不符 ${tag}`);
      else assert.ok(text1.includes(`空位率約 ${approx(100 - it.pct)}%`), `理由空位不符 ${tag}`);
      assert.ok(text1.includes(`步行約 ${it.walkIn} 分`), `理由步行不符 ${tag}`);
      if (it.queue) assert.ok(text1.includes(`排隊約 ${it.queue} 分`), `理由排隊不符 ${tag}`);
      // 候選清單中被選中者與所選地點一致
      assert.equal(it.alts.filter((a) => a.picked).map((a) => a.id)[0], it.place.id);
    }
    assert.equal(plan.totalWalk, walkSum, '總步行不符');
  }
});

test('重新調配後仍滿足全部不變條件', () => {
  for (const text of TEXTS) {
    const ctx = mk(text, {});
    const r = reallocate(ctx);
    const plan = buildPlan({ ...ctx, ...r });
    assertValid(assert, plan, { ...ctx, ...r });
  }
});

test('沒有空堂時不會硬排，並回報原因', () => {
  const ctx = mk('吃午餐', { courses: [course(1, '08:00', '22:00', 'mgmt2')] });
  const plan = buildPlan(ctx);
  assert.equal(plan.items.length, 0);
  assert.ok(plan.unscheduled[0].reason.length > 0);
});
