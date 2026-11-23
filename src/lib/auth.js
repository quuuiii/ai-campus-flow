// Supabase Auth（Email magic link，REST，無 SDK）。未設定環境變數時不會被呼叫。
// 只使用 anon key；登入後以使用者自己的 access token 呼叫 API，權限由資料庫 RLS 決定。
export const SESSION_KEY = 'campus-flow-session-v1';
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

const hdr = (cfg, token) => ({ apikey: cfg.key, Authorization: `Bearer ${token || cfg.key}`, 'Content-Type': 'application/json' });
export function loadSession(storage) {
  try { const s = JSON.parse(storage.getItem(SESSION_KEY) || 'null'); return s && typeof s.access_token === 'string' && typeof s.refresh_token === 'string' ? s : null; } catch { return null; }
}
export const saveSession = (storage, s) => { try { if (s) storage.setItem(SESSION_KEY, JSON.stringify(s)); else storage.removeItem(SESSION_KEY); return true; } catch { return false; } };

// 寄送登入連結；redirect 回到目前網站
export async function sendMagicLink(cfg, email, redirectTo, fetchImpl = globalThis.fetch) {
  email = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: '請輸入有效的電子郵件' };
  try {
    const res = await fetchImpl(`${cfg.url}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, { method: 'POST', headers: hdr(cfg), body: JSON.stringify({ email, create_user: true }) });
    if (res.ok) return { ok: true };
    return { ok: false, error: res.status === 429 ? '寄送太頻繁，請稍後再試' : `寄送失敗（${res.status}）` };
  } catch { return { ok: false, error: '目前離線' }; }
}

// 從登入連結回來時，網址 hash 帶有 token；讀取後立即從網址清除
export function sessionFromHash(hash, now = Date.now()) {
  const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  if (p.get('error_description')) return { error: p.get('error_description') };
  const access_token = p.get('access_token'), refresh_token = p.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  const exp = +p.get('expires_in') || 3600;
  return { access_token, refresh_token, expires_at: now + exp * 1000 };
}

async function refresh(cfg, s, fetchImpl) {
  const res = await fetchImpl(`${cfg.url}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: hdr(cfg), body: JSON.stringify({ refresh_token: s.refresh_token }) });
  if (!res.ok) return null;
  const j = await res.json();
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000 };
}

// 取得有效 token（快過期自動換新；換新失敗＝登出）。回傳 null 表示未登入。
export async function validToken(cfg, storage, fetchImpl = globalThis.fetch) {
  let s = loadSession(storage);
  if (!cfg || !s) return null;
  if (!(s.expires_at > Date.now() + 60_000)) {
    try { s = await refresh(cfg, s, fetchImpl); } catch { return s.access_token; /* 離線時先沿用，伺服器會判斷 */ }
    saveSession(storage, s);
    if (!s) return null;
  }
  return s.access_token;
}

// 使用者資訊與角色
export async function whoami(cfg, token, fetchImpl = globalThis.fetch) {
  const u = await fetchImpl(`${cfg.url}/auth/v1/user`, { headers: hdr(cfg, token) });
  if (!u.ok) return null;
  const user = await u.json();
  const r = await fetchImpl(`${cfg.url}/rest/v1/profiles?select=role&user_id=eq.${encodeURIComponent(user.id)}`, { headers: hdr(cfg, token) });
  const rows = r.ok ? await r.json() : [];
  return { id: user.id, email: user.email, role: rows[0]?.role || 'reporter' };
}

export async function signOut(cfg, storage, fetchImpl = globalThis.fetch) {
  const s = loadSession(storage);
  saveSession(storage, null);
  if (cfg && s) { try { await fetchImpl(`${cfg.url}/auth/v1/logout`, { method: 'POST', headers: hdr(cfg, s.access_token) }); } catch { /* 本機已登出即可 */ } }
}

// ── 管理員 ──
export async function reviewQueue(cfg, token, fetchImpl = globalThis.fetch) {
  const r = await fetchImpl(`${cfg.url}/rest/v1/crowd_review_queue?select=*&limit=100`, { headers: hdr(cfg, token) });
  return r.ok ? r.json() : Promise.reject(new Error(`讀取待審清單失敗（${r.status}）`));
}
export async function review(cfg, token, id, status, fetchImpl = globalThis.fetch) {
  if (!['approved', 'rejected'].includes(status) || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('參數錯誤');
  const r = await fetchImpl(`${cfg.url}/rest/v1/crowd_observations?id=eq.${id}`, { method: 'PATCH', headers: { ...hdr(cfg, token), Prefer: 'return=minimal' }, body: JSON.stringify({ status }) });
  if (!r.ok) throw new Error(`審核失敗（${r.status}）`);
}
export async function members(cfg, token, fetchImpl = globalThis.fetch) {
  const r = await fetchImpl(`${cfg.url}/rest/v1/member_list?select=*&order=created_at`, { headers: hdr(cfg, token) });
  return r.ok ? r.json() : Promise.reject(new Error(`讀取成員失敗（${r.status}）`));
}
export async function setRole(cfg, token, userId, role, fetchImpl = globalThis.fetch) {
  if (!['reporter', 'member', 'admin'].includes(role) || !/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('參數錯誤');
  const r = await fetchImpl(`${cfg.url}/rest/v1/profiles?user_id=eq.${userId}`, { method: 'PATCH', headers: { ...hdr(cfg, token), Prefer: 'return=minimal' }, body: JSON.stringify({ role }) });
  if (!r.ok) throw new Error(`變更角色失敗（${r.status}）`);
}
