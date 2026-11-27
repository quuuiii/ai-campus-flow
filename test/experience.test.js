// 團隊經驗設定（2026-11）是否正確寫進模擬規則
import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACES, BUILDINGS } from '../src/data/places.js';
import { simLevel, queueMin, simulate, isClosed } from '../src/engine/crowd.js';
import { buildPlan, parseTasks } from '../src/engine/scheduler.js';
import { course } from './helpers.js';
const H = (h, m = 0) => h * 60 + m, L = simLevel, P = PLACES;

test('後門：中午 5 級、17:00 4.5 級、18–19 點 3.5 級、離峰 3 級；尖峰排隊 20 分', () => {
  assert.equal(L(P.backdoor, H(12, 15), 2), 5); assert.equal(L(P.backdoor, H(17, 15), 2), 4.5);
  assert.equal(L(P.backdoor, H(18, 30), 2), 3.5); assert.equal(L(P.backdoor, H(11), 2), 3); assert.equal(L(P.backdoor, H(14), 2), 3);
  assert.equal(queueMin(simulate(P.backdoor, H(12, 15), 2), P.backdoor), 20);
});
test('後門：週五晚上、週六中午晚上、週日中午人變少；週日晚上照常', () => {
  assert.ok(L(P.backdoor, H(17, 15), 5) < L(P.backdoor, H(17, 15), 4));
  assert.ok(L(P.backdoor, H(12, 15), 6) < 5 && L(P.backdoor, H(17, 15), 6) < 4.5);
  assert.ok(L(P.backdoor, H(12, 15), 0) < 5); assert.equal(L(P.backdoor, H(17, 15), 0), 4.5);
  assert.equal(L(P.backdoor, H(12, 15), 5), 5, '週五中午不變');
});
test('宵夜街與後門相同', () => { for (const t of [H(11), H(12, 15), H(17, 15), H(19)]) for (const d of [1, 5, 6, 0]) assert.equal(L(P.nightmarket, t, d), L(P.backdoor, t, d)); });
test('女十四：中午與 17:00 3.5 級、離峰 2 級；尖峰排隊約 5 分（7 分取 5 分單位）', () => {
  assert.equal(L(P.female14, H(12, 15), 2), 3.5); assert.equal(L(P.female14, H(17, 15), 2), 3.5); assert.equal(L(P.female14, H(15), 2), 2);
  assert.equal(queueMin(simulate(P.female14, H(12, 15), 2), P.female14), 5);
});
test('男九 7-11：中午 5 級、傍晚較少、離峰 3、週末 2；尖峰結帳 25 分；只用於吃飯', () => {
  assert.equal(L(P.male9_711, H(12, 15), 2), 5); assert.ok(L(P.male9_711, H(17, 15), 2) < 5); assert.equal(L(P.male9_711, H(15), 2), 3);
  assert.equal(L(P.male9_711, H(12, 15), 6), 2);
  assert.equal(queueMin(simulate(P.male9_711, H(12, 15), 2), P.male9_711), 25);
  assert.deepEqual(P.male9_711.kinds, ['meal']);
});
test('松果：12:00–12:20 4 級、離峰 2；尖峰排隊 15 分；週末不營業，不會被排入', () => {
  assert.equal(L(P.pinecone, H(12, 10), 2), 4); assert.equal(L(P.pinecone, H(14), 2), 2);
  assert.equal(queueMin(simulate(P.pinecone, H(12, 10), 2), P.pinecone), 15);
  assert.ok(isClosed(P.pinecone, 6) && isClosed(P.pinecone, 0) && !isClosed(P.pinecone, 3));
  for (const day of [0, 6]) {
    const tasks = parseTasks('吃午餐');
    const p = buildPlan({ courses: [], day, win: { start: 600, end: 900 }, tasks, order: tasks.map((t) => t.id), overrides: { meal0: 'pinecone' } });
    assert.ok(p.items.every((it) => it.place.id !== 'pinecone'));
  }
});
test('總圖：15:00 前 2 級、之後漸增；週末較多人。K 書中心：15:00 後增加到 4、週末整天 3.5', () => {
  assert.equal(L(P.mainlib, H(13), 2), 2); assert.ok(L(P.mainlib, H(18), 2) > 2); assert.ok(L(P.mainlib, H(13), 6) > L(P.mainlib, H(13), 2));
  assert.equal(L(P.zhongzheng, H(13), 2), 3); assert.equal(L(P.zhongzheng, H(18), 2), 4); assert.equal(L(P.zhongzheng, H(10), 0), 3.5);
});
test('行政大樓不蒐集人潮但仍可當辦事目的地；系館依教務處代號表', () => {
  assert.ok(P.admin.nodata && P.admin.kinds.includes('errand'));
  for (const code of ['A', 'C2', 'E', 'E1', 'H2', 'HK', 'IL', 'M', 'O', 'S', 'S1', 'S4', 'TR', 'YH']) assert.ok(BUILDINGS[code]?.startsWith(code + ' '), code);
  for (const k of ['mgmt2', 'eng5', 'zhixi', 'hss', 'zhidao']) assert.ok(BUILDINGS[k], '舊 key 保留：' + k);
  assert.equal(Object.keys(BUILDINGS).length, 29);
});
import { walk, walkSource } from '../src/data/places.js';
test('步行時間：團隊以 Google 地圖查詢的 15 組（雙向相同）', () => {
  const G = { 'mgmt2|backdoor': 9, 'mgmt2|nightmarket': 10, 'mgmt2|pinecone': 10, 'mgmt2|female14': 11, 'mgmt2|male9_711': 3, 'mgmt2|mainlib': 4, 'mgmt2|zhongzheng': 4, 'eng5|backdoor': 7, 'eng5|pinecone': 14, 'eng5|female14': 15, 'eng5|male9_711': 15, 'eng5|mainlib': 12, 'backdoor|mainlib': 7, 'pinecone|mainlib': 6, 'male9_711|mainlib': 5 };
  for (const [k, v] of Object.entries(G)) { const [a, b] = k.split('|'); assert.equal(walk(a, b), v, k); assert.equal(walk(b, a), v, k); assert.equal(walkSource(a, b), 'gmaps', k); }
  assert.equal(walkSource('eng5', 'zhongzheng'), 'estimate');
  assert.equal(walkSource('mainlib', 'mainlib'), 'none');
});
import { DORMS, originGroups } from '../src/data/places.js';
import { sanitizePlan } from '../src/store.js';
test('宿舍可作為出發地點，並會被保存；步行標示為預估', () => {
  assert.equal(Object.keys(DORMS).length, 8);
  assert.deepEqual(originGroups().map((g) => g[0]), ['宿舍', '教學大樓', '校園地點']);
  assert.ok(!originGroups()[2][1].some(([id]) => id === 'self' || id === 'admin'));
  assert.equal(sanitizePlan({ origin: 'dorm_xiwang', text: '吃午餐' }, []).origin, 'dorm_xiwang');
  assert.equal(walkSource('dorm_m13', 'backdoor'), 'estimate');
  const tasks = parseTasks('吃午餐');
  const p = buildPlan({ courses: [], day: 2, win: { start: 660, end: 900 }, tasks, order: tasks.map((t) => t.id), origin: 'dorm_m9', mode: 'walk' });
  assert.equal(p.items[0].from, 'dorm_m9');
});
