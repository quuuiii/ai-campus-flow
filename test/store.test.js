import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadState, saveState, KEYS, sanitizeCourse, findConflict, loadObservations, saveObservations, addObservation, deleteObservation, obsToCSV, importObservationsCSV, sanitizeObs, sortCourses, viewCourses, viewPlan, setDemo } from '../src/store.js';
import { parseCSV } from '../src/util.js';

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };

test('第一次使用：載入 Demo 情境', () => {
  const { state, report } = loadState(mem());
  assert.ok(report.firstRun); assert.ok(state.demo); assert.equal(state.courses.length, 0, '使用者課表是空的，示範課表另外產生');
  assert.ok(viewCourses(state).length > 0); assert.ok(viewPlan(state).tasks.length > 0);
});
test('示範課表與使用者資料隔離：切換不覆蓋、不遺失，存檔後也保留', () => {
  const s = mem();
  const { state } = loadState(s);
  setDemo(state, false);
  state.courses.push(sanitizeCourse({ id: 'mine1', day: 2, start: '10:00', end: '11:50', name: '我的課', building: 'mgmt2' }));
  state.plan.text = '我的需求';
  saveState(state, s);
  setDemo(state, true); saveState(state, s);
  const r2 = loadState(s).state;
  assert.equal(r2.demo, true); assert.equal(r2.courses.length, 1); assert.equal(r2.courses[0].name, '我的課'); assert.equal(r2.plan.text, '我的需求');
  assert.ok(viewCourses(r2).every((c) => c.demo)); assert.ok(!viewCourses(r2).some((c) => c.name === '我的課'));
  setDemo(r2, false); assert.deepEqual(viewCourses(r2).map((c) => c.name), ['我的課']);
});
test('舊版混在一起的示範課程：只有示範 → 進入示範模式；有自己的課 → 只保留自己的課', () => {
  const demoC = { id: 'demo0', day: 1, start: '09:00', end: '11:50', name: '系統分析與設計', building: 'mgmt2', color: 0, demo: true };
  const a = loadState(mem({ [KEYS.state]: JSON.stringify({ courses: [demoC], plan: { text: 'x' } }) }));
  assert.equal(a.state.demo, true); assert.equal(a.state.courses.length, 0); assert.ok(a.report.migratedDemo);
  const mine = { id: 'm1', day: 3, start: '13:00', end: '14:50', name: '我的課', building: 'eng5', color: 2 };
  const b = loadState(mem({ [KEYS.state]: JSON.stringify({ courses: [demoC, mine], plan: { text: 'y' } }) }));
  assert.equal(b.state.demo, false); assert.deepEqual(b.state.courses.map((c) => c.name), ['我的課']); assert.equal(b.state.plan.text, 'y');
});
test('v1 → v2 遷移：保留使用者既有課表，不被 Demo 覆蓋', () => {
  const v1 = { courses: [{ id: 1700000000000, day: '2', start: '10:00', end: '12:00', name: '資料庫管理' }], tab: 'home' };
  const s = mem({ [KEYS.legacy]: JSON.stringify(v1) });
  const { state, report } = loadState(s);
  assert.ok(report.migrated); assert.equal(state.courses.length, 1); assert.equal(state.courses[0].name, '資料庫管理'); assert.equal(state.demo, false);
  assert.ok(s.getItem(KEYS.legacy), '舊資料不應被刪除');
});
test('資料損壞：備份原文並重設，不崩潰', () => {
  const s = mem({ [KEYS.state]: '{壞掉的json' });
  const { state, report } = loadState(s);
  assert.ok(report.reset); assert.ok(report.corruptBackup); assert.equal(s.getItem(report.corruptBackup), '{壞掉的json'); assert.ok(Array.isArray(state.courses));
});
test('格式錯誤的課程會被丟棄並計數，其餘保留', () => {
  const s = mem({ [KEYS.state]: JSON.stringify({ courses: [{ id: 'a', day: '1', start: '09:00', end: '10:00', name: 'OK' }, { day: '9', start: '09:00', end: '10:00', name: '壞星期' }, { day: '1', start: '11:00', end: '10:00', name: '時間反了' }, null, 'x'], plan: 5 }) });
  const { state, report } = loadState(s);
  assert.equal(state.courses.length, 1); assert.equal(report.dropped, 4); assert.ok(state.plan.tasks.length >= 0);
});
test('儲存後再載入相同', () => {
  const s = mem(); const { state } = loadState(s);
  assert.ok(saveState(state, s)); const again = loadState(s).state;
  assert.equal(again.courses.length, state.courses.length); assert.equal(again.plan.mode, state.plan.mode);
});
test('儲存失敗（容量滿）回傳 false 而不丟例外', () => {
  const s = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.equal(saveState({ courses: [], plan: {}, ui: {} }, s), false);
});
test('課程驗證與衝突偵測', () => {
  assert.equal(sanitizeCourse({ name: ' ', day: '1', start: '09:00', end: '10:00' }), null);
  const a = sanitizeCourse({ id: 'a', name: 'A', day: '1', start: '09:00', end: '10:00' });
  assert.ok(findConflict([a], { day: '1', start: '09:30', end: '10:30' }));
  assert.equal(findConflict([a], { day: '1', start: '10:00', end: '11:00' }), null);
  assert.equal(findConflict([a], { day: '1', start: '09:30', end: '10:30' }, 'a'), null, '編輯自己時不算衝突');
});
test('課表依星期與時間排序', () => {
  const l = sortCourses([{ day: '2', start: '08:00' }, { day: '1', start: '13:00' }, { day: '1', start: '09:00' }]);
  assert.deepEqual(l.map((c) => c.start), ['09:00', '13:00', '08:00']);
});

test('觀察紀錄：新增、驗證、單筆刪除', () => {
  let { list } = loadObservations(mem());
  let r = addObservation(list, { place: '後門餐飲區', crowd: 4, queue: 8 }); list = r.list;
  assert.equal(list.length, 1); assert.equal(list[0].placeId, 'backdoor'); assert.match(list[0].timestamp, /\+08:00$/);
  assert.equal(addObservation(list, { place: '後門餐飲區', crowd: 9 }).added, null, '擁擠度超出範圍不可儲存');
  list = addObservation(list, { place: '宵夜街（外帶）', crowd: 2 }).list;
  list = deleteObservation(list, list[0].id); assert.equal(list.length, 1); assert.equal(list[0].place, '宵夜街（外帶）');
});
test('舊格式觀察紀錄可讀取，壞資料被略過', () => {
  const s = mem({ [KEYS.obs]: JSON.stringify([{ timestamp: '2026-11-20T04:10:00.000Z', place: '國立中央大學圖書館', crowd: 3, method: 'onsite' }, { timestamp: 'bad', place: 'x', crowd: 3 }, { place: 'y' }]) });
  const { list, dropped } = loadObservations(s);
  assert.equal(list.length, 1); assert.equal(dropped, 2); assert.ok(list[0].id.startsWith('legacy-')); assert.match(list[0].timestamp, /^2026-11-20T12:10:00\+08:00$/);
});
test('CSV 匯出含 BOM 友善欄位與繁體中文，匯入可還原且略過重複', () => {
  let list = [];
  list = addObservation(list, { place: '後門餐飲區', crowd: 4, queue: 8, note: '雞排店，有"人"排隊, 很長' }).list;
  const csv = obsToCSV(list);
  assert.match(csv, /地點/); assert.match(csv, /後門餐飲區/);
  assert.equal(parseCSV(csv)[1][7], '雞排店，有"人"排隊, 很長');
  const again = importObservationsCSV(list, csv);
  assert.equal(again.added, 0); assert.equal(again.skipped, 1);
  const other = importObservationsCSV([], csv);
  assert.equal(other.added, 1); assert.equal(other.list[0].queue, 8);
});
test('匯入：欄位不符或不合法列會被擋下', () => {
  assert.ok(importObservationsCSV([], 'a,b\n1,2').error);
  const r = importObservationsCSV([], 'timestamp,place,crowd\n2026-11-20T12:00:00+08:00,後門餐飲區,7\n2026-11-20T12:00:00+08:00,後門餐飲區,3');
  assert.equal(r.invalid, 1); assert.equal(r.added, 1);
});
test('sanitizeObs 拒絕缺少地點或非法時間', () => {
  assert.equal(sanitizeObs({ timestamp: 'x', place: 'a', crowd: 3 }), null);
  assert.equal(sanitizeObs({ timestamp: '2026-11-20T00:00:00Z', place: '', crowd: 3 }), null);
});
