// 隨機課表 × 隨機需求的排程不變條件測試（固定亂數種子，可重現）
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, parseTasks, reallocate } from '../src/engine/scheduler.js';
import { toMin, fmt } from '../src/util.js';

let seed = 1; const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const B = ['mgmt2', 'eng5', 'zhixi', 'zhidao', 'hss', null];
const T = ['吃午餐', '讀書一小時', '五點前完成作業', '小組討論兩小時', '去行政大樓辦事', '讀書30分鐘', '三點前完成報告', '吃晚餐'];

test('1500 組隨機情境（含重新調配）全部滿足不變條件', () => {
  for (let i = 0; i < 1500; i++) {
    const courses = []; let t = 480 + Math.floor(r() * 4) * 30;
    while (t < 1200) { const d = 50 + Math.floor(r() * 3) * 60; if (r() < 0.6) courses.push({ id: 'c' + t, day: '1', start: fmt(t), end: fmt(t + d), building: B[Math.floor(r() * 6)], name: 'c' }); t += d + 10 + Math.floor(r() * 6) * 10; }
    const tasks = parseTasks(T.filter(() => r() < 0.45).join('，'));
    const ctx = { courses, day: 1, win: { start: 480 + Math.floor(r() * 3) * 60, end: 1080 + Math.floor(r() * 3) * 60 }, tasks, order: tasks.map((x) => x.id), overrides: {}, scale: {}, deferred: [], mode: ['crowd', 'walk', 'focus'][i % 3], buffer: [0, 5, 10][Math.floor(r() * 3)], origin: r() < 0.5 ? 'mainlib' : '' };
    for (const c of [ctx, { ...ctx, ...reallocate(ctx) }]) {
      const p = buildPlan(c), cs = courses.map((x) => [toMin(x.start), toMin(x.end)]), tag = JSON.stringify({ i, courses: courses.map((x) => [x.start, x.end]) });
      const its = [...p.items].sort((a, b) => a.start - b.start);
      for (const it of p.items) {
        assert.ok(!cs.some(([s, e]) => it.depart < e && it.end > s), '任務或移動與課程重疊 ' + tag);
        assert.ok(it.start >= c.win.start && it.end <= c.win.end, '超出時間範圍 ' + tag);
        if (it.task.deadline != null) assert.ok(it.end <= it.task.deadline, '超過截止 ' + tag);
        if (it.slack != null) assert.ok(it.slack >= 0, '負緩衝 ' + tag);
        if (it.isLast && it.slot.hasNext) assert.ok(it.end + it.walkOut + c.buffer <= it.slot.e, '來不及上下一堂課 ' + tag);
        assert.equal(it.arrive, it.depart + it.walkIn, '抵達≠出發+步行 ' + tag);
        assert.ok(it.start >= it.arrive + it.queue, '開始早於抵達+排隊 ' + tag);
        if (it.task.deadline != null) assert.equal(it.deadlineSlack, it.task.deadline - it.end, '截止餘裕過期 ' + tag);
      }
      for (let k = 1; k < its.length; k++) assert.ok(its[k].depart >= its[k - 1].end, '任務互相重疊 ' + tag);
      for (const u of p.unscheduled) assert.ok(u.reason, '未排入必須有原因');
      assert.equal(p.totalWalk, p.moveWalk + p.toClassWalk);
      assert.equal(p.toClassWalk, p.items.reduce((a, it) => a + (it.isLast && it.slot.hasNext ? it.walkOut : 0), 0), '回課堂步行重複計算');
    }
  }
});
