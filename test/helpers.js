import { buildPlan, parseTasks } from '../src/engine/scheduler.js';
import { toMin } from '../src/util.js';

export const course = (day, start, end, building = null, name = '課') => ({ id: `${day}${start}`, day: String(day), start, end, building, name });
export const DEMO = [course(1, '09:00', '11:50', 'mgmt2', '系統分析與設計'), course(1, '13:00', '14:50', 'eng5', '企業資料通訊')];
export const mk = (text, over = {}) => {
  const tasks = parseTasks(text);
  return { courses: DEMO, day: 1, win: { start: 540, end: 1020 }, tasks, order: tasks.map((t) => t.id), overrides: {}, scale: {}, deferred: [], mode: 'crowd', buffer: 5, ...over };
};
export const run = (text, over) => { const ctx = mk(text, over); return { ctx, plan: buildPlan(ctx) }; };

// 不變條件：只在空堂內、不重疊課程、不重疊彼此、回到下一堂課來得及
export function assertValid(assert, plan, ctx) {
  const cs = ctx.courses.filter((c) => +c.day === +ctx.day).map((c) => [toMin(c.start), toMin(c.end)]);
  const sorted = [...plan.items].sort((a, b) => a.start - b.start);
  for (const it of plan.items) {
    assert.ok(it.start >= it.slot.s && it.end <= it.slot.e, `任務超出空堂：${it.task.id} ${it.start}-${it.end} 不在 ${it.slot.s}-${it.slot.e}`);
    assert.ok(it.start >= ctx.win.start && it.end <= ctx.win.end, '任務超出指定時間範圍');
    for (const [s, e] of cs) assert.ok(it.end <= s || it.start >= e, `與課程重疊：${it.task.id}`);
    if (it.slot.hasNext) assert.ok(it.end + it.walkOut + (ctx.buffer ?? 5) <= it.slot.e, `趕不上下一堂課：${it.task.id}`);
    if (it.task.deadline != null) assert.ok(it.end <= it.task.deadline, `超過截止時間：${it.task.id}`);
    assert.ok(it.dur > 0);
  }
  for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].depart >= sorted[i - 1].end || sorted[i].slot !== sorted[i - 1].slot, '任務彼此重疊');
  assert.deepEqual(plan.items.map((i) => i.start), [...plan.items.map((i) => i.start)].sort((a, b) => a - b), '行程未依時間排序');
}
