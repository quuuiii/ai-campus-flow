import test from 'node:test';
import assert from 'node:assert/strict';
import { syncConfig, enqueue, outbox, flush, pull, mergeObs, retryFailed, toRow } from '../src/lib/sync.js';
import { dashboardStats } from '../src/engine/stats.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const cfg = { url: 'https://abc.supabase.co', key: 'x'.repeat(40) };
const obs = (id, placeId = 'backdoor') => ({ id, timestamp: '2026-11-11T12:10:00+08:00', place: '後門餐飲區', placeId, crowd: 4, queue: 5, method: 'onsite', note: '' });
const res = (status, body = '') => ({ ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) });

test('未設定或格式錯誤的環境變數 → 不連線', () => {
  assert.equal(syncConfig({}), null);
  assert.equal(syncConfig({ VITE_SUPABASE_URL: 'http://evil.com', VITE_SUPABASE_ANON_KEY: 'x'.repeat(40) }), null);
  assert.ok(syncConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co/', VITE_SUPABASE_ANON_KEY: 'x'.repeat(40) }));
});
test('入列去重；沒有地點代碼的舊資料不入列', () => {
  const s = mem();
  assert.ok(enqueue(s, obs('a1')) && enqueue(s, obs('a1')));
  assert.equal(outbox(s).length, 1);
  assert.equal(enqueue(s, { ...obs('a2'), placeId: undefined }), false);
});
test('送出成功移出佇列；離線保留；429 保留；400 標記失敗可重試', async () => {
  const s = mem(); ['a', 'b', 'c', 'd'].forEach((x) => enqueue(s, obs('id-' + x)));
  const plan = { 'id-a': () => res(201), 'id-b': () => res(429), 'id-c': () => res(400, 'bad'), 'id-d': () => res(201) };
  const calls = [];
  const r = await flush(cfg, s, async (url, opt) => { const b = JSON.parse(opt.body); calls.push(b); assert.match(opt.headers.Prefer, /ignore-duplicates/); return plan[b.client_id](); });
  assert.deepEqual(r, { sent: 2, failed: 1, pending: 1 });
  assert.ok(!('reporter' in calls[0]) && !('status' in calls[0]), '前端不送狀態或回報者');
  const off = await flush(cfg, s, async () => { throw new TypeError('offline'); });
  assert.equal(off.pending, 1); assert.match(outbox(s).find((x) => x.id === 'id-b').error, /離線/);
  retryFailed(s); assert.equal(outbox(s).filter((x) => x.status === 'pending').length, 2);
});
test('未設定時 flush 不呼叫網路', async () => {
  const s = mem(); enqueue(s, obs('z1'));
  const r = await flush(null, s, async () => assert.fail('不應連線'));
  assert.equal(r.pending, 1);
});
test('下載公開資料並與本機合併去重', async () => {
  const s = mem();
  const r = await pull(cfg, s, async (url) => { assert.match(url, /crowd_observations_public/); return res(200, JSON.stringify([{ client_id: 'a1', observed_at: '2026-11-11T04:10:00Z', place_id: 'backdoor', crowd_level: 3, method: 'onsite' }, { client_id: 'r9', observed_at: '2026-11-12T04:10:00Z', place_id: 'mainlib', crowd_level: 2, method: 'onsite' }])); });
  assert.equal(r.n, 2);
  const merged = mergeObs([obs('a1')], JSON.parse(s.getItem('campus-flow-remote-obs-v1')));
  assert.deepEqual(merged.map((o) => o.id), ['a1', 'r9']);
});
test('toRow 欄位對應 schema', () => {
  assert.deepEqual(Object.keys(toRow(obs('q1'), 'dev')).sort(), ['client_id', 'crowd_level', 'device_hash', 'method', 'note', 'observed_at', 'place_id', 'queue_minutes', 'source'].sort());
});
test('儀表板統計：總數、日期、星期×時段、缺資料地點', () => {
  const list = [obs('1'), { ...obs('2'), timestamp: '2026-11-12T15:00:00+08:00' }, { ...obs('3', 'mainlib'), timestamp: '2026-11-15T09:00:00+08:00' }, { ...obs('4'), placeId: undefined, place: '不明地點' }];
  const d = dashboardStats(list);
  assert.equal(d.total, 3); assert.equal(d.unknown, 1);
  const back = d.rows.find((r) => r.place.id === 'backdoor');
  assert.equal(back.n, 2); assert.equal(back.dates, 2); assert.equal(back.meetsMin, false); assert.equal(back.needN, 18);
  assert.equal(d.grid[3].lunch, 1); assert.equal(d.grid[4].pm, 1); assert.equal(d.grid[0].am, 1);
  assert.ok(d.missing.some((p) => p.id === 'female14'));
  assert.ok(!d.rows.some((r) => r.place.id === 'self'));
  assert.equal(new Date(d.last).toISOString(), '2026-11-15T01:00:00.000Z');
});
test('環境變數容錯：去掉 /rest/v1/；支援 publishable key；拒絕 secret key', async () => {
  const k = 'sb_publishable_' + 'a'.repeat(30);
  assert.deepEqual(syncConfig({ VITE_SUPABASE_URL: ' https://cccyusebwmxjfvnmkkvs.supabase.co/rest/v1/ ', VITE_SUPABASE_ANON_KEY: k + ' ' }), { url: 'https://cccyusebwmxjfvnmkkvs.supabase.co', key: k });
  assert.equal(syncConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: 'sb_secret_' + 'a'.repeat(30) }), null);
  const s = mem(); enqueue(s, obs('h1'));
  await flush({ url: 'https://abc.supabase.co', key: k }, s, async (u, o) => { assert.equal(o.headers.apikey, k); assert.ok(!('Authorization' in o.headers), '未登入不帶 Bearer'); return res(201); });
});
