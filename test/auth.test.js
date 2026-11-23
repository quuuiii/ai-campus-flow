import test from 'node:test';
import assert from 'node:assert/strict';
import { sendMagicLink, sessionFromHash, saveSession, loadSession, validToken, whoami, review, setRole, signOut } from '../src/lib/auth.js';
import { flush, enqueue, outbox } from '../src/lib/sync.js';

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const cfg = { url: 'https://abc.supabase.co', key: 'anon'.repeat(10) };
const res = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body ?? '') });
const UID = '11111111-2222-3333-4444-555555555555';

test('寄送登入連結：驗證 email、帶 redirect、處理限流', async () => {
  assert.equal((await sendMagicLink(cfg, 'abc', 'https://x')).ok, false);
  let url;
  assert.ok((await sendMagicLink(cfg, ' A@cc.ncu.edu.tw ', 'https://site/', async (u, o) => { url = u; assert.equal(JSON.parse(o.body).email, 'a@cc.ncu.edu.tw'); return res(200, {}); })).ok);
  assert.match(url, /\/auth\/v1\/otp\?redirect_to=https%3A%2F%2Fsite%2F/);
  assert.match((await sendMagicLink(cfg, 'a@b.tw', 'x', async () => res(429))).error, /頻繁/);
});
test('解析登入回傳的 hash；錯誤訊息也會回報', () => {
  const s = sessionFromHash('#access_token=AT&refresh_token=RT&expires_in=3600&type=magiclink', 1000);
  assert.deepEqual(s, { access_token: 'AT', refresh_token: 'RT', expires_at: 3601000 });
  assert.equal(sessionFromHash('#foo=1'), null);
  assert.match(sessionFromHash('#error=access_denied&error_description=Email+link+is+invalid').error, /invalid/);
});
test('token 快過期自動換新；換新失敗視為登出', async () => {
  const s = mem();
  saveSession(s, { access_token: 'old', refresh_token: 'r1', expires_at: Date.now() + 10_000 });
  assert.equal(await validToken(cfg, s, async (u) => { assert.match(u, /grant_type=refresh_token/); return res(200, { access_token: 'new', refresh_token: 'r2', expires_in: 3600 }); }), 'new');
  assert.equal(loadSession(s).refresh_token, 'r2');
  saveSession(s, { access_token: 'x', refresh_token: 'bad', expires_at: 0 });
  assert.equal(await validToken(cfg, s, async () => res(400, {})), null);
  assert.equal(loadSession(s), null);
  assert.equal(await validToken(null, s), null);
});
test('whoami 讀角色；沒有 profile 時視為 reporter', async () => {
  const f = async (u) => (u.includes('/auth/v1/user') ? res(200, { id: UID, email: 'a@b.tw' }) : res(200, []));
  assert.deepEqual(await whoami(cfg, 'T', f), { id: UID, email: 'a@b.tw', role: 'reporter' });
});
test('審核與角色變更：只接受合法參數，且帶使用者 token', async () => {
  await assert.rejects(review(cfg, 'T', 'drop table', 'approved', async () => res(204)));
  await assert.rejects(review(cfg, 'T', UID, 'deleted', async () => res(204)));
  await review(cfg, 'T', UID, 'approved', async (u, o) => { assert.equal(o.method, 'PATCH'); assert.equal(o.headers.Authorization, 'Bearer T'); assert.deepEqual(JSON.parse(o.body), { status: 'approved' }); return res(204); });
  await assert.rejects(setRole(cfg, 'T', UID, 'superuser', async () => res(204)));
  await assert.rejects(review(cfg, 'T', UID, 'rejected', async () => res(403)), /403/);
});
test('登入後上傳用使用者 token；401 保留在佇列', async () => {
  const s = mem(); enqueue(s, { id: 'o-1', timestamp: '2026-11-11T12:00:00+08:00', place: 'x', placeId: 'backdoor', crowd: 3 });
  const r = await flush(cfg, s, async (u, o) => { assert.equal(o.headers.Authorization, 'Bearer USER'); return res(401); }, 'USER');
  assert.equal(r.pending, 1); assert.match(outbox(s)[0].error, /登入已過期/);
});
test('登出清除本機 session，即使網路失敗', async () => {
  const s = mem(); saveSession(s, { access_token: 'a', refresh_token: 'b', expires_at: 1 });
  await signOut(cfg, s, async () => { throw new Error('offline'); });
  assert.equal(loadSession(s), null);
});
