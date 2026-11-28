// 觀察紀錄同步（Supabase REST，無 SDK）。未設定環境變數時完全不連線，App 照常以本機資料運作。
// 離線或失敗時留在本機「待上傳佇列」，下次再送；以 client_id 去重，重送不會產生重複資料。
// 只在有使用者登入 token 時才帶 Authorization；未登入只帶 apikey（publishable key 不是 JWT，不能放在 Bearer）
export const authHeaders = (cfg, token) => (token ? { apikey: cfg.key, Authorization: `Bearer ${token}` } : { apikey: cfg.key });
export const OUTBOX_KEY = 'campus-flow-outbox-v1';
export const REMOTE_KEY = 'campus-flow-remote-obs-v1';
export const UPLOADED_KEY = 'campus-flow-uploaded-v1'; // 已確認上傳成功的紀錄 id

export function syncConfig(env = {}) {
  // 容錯：去掉前後空白、結尾斜線與誤貼的 /rest/v1
  const url = String(env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, '').replace(/\/+$/, '');
  // 新版 publishable key（sb_publishable_…）或舊版 anon key（eyJ… JWT）皆可；拒絕 secret/service_role
  const key = String(env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (/^sb_secret_/.test(key)) return null;
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || key.length < 20) return null;
  return { url, key };
}

const read = (storage, k) => { try { const v = JSON.parse(storage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
const write = (storage, k, v) => { try { storage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

// 匿名裝置雜湊：只用於伺服器限流，不含個資
export function deviceHash(storage) {
  let h = null;
  try { h = storage.getItem('campus-flow-device'); if (!h) { h = 'd' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); storage.setItem('campus-flow-device', h); } } catch { /* 無法儲存時不送 */ }
  return h;
}

export const toRow = (o, device) => ({
  client_id: o.id, observed_at: o.timestamp, place_id: o.placeId, crowd_level: o.crowd,
  queue_minutes: o.queue ?? null, method: o.method === 'manual' ? 'manual' : 'onsite', note: o.note || null,
  source: o.source === 'csv_import' ? 'csv_import' : 'app', device_hash: device,
});

export const outbox = (storage) => read(storage, OUTBOX_KEY);
// 加入待上傳佇列（沒有地點代碼的舊資料無法上傳，回傳 false）
export function enqueue(storage, obs) {
  if (!obs?.placeId) return false;
  const q = outbox(storage);
  if (q.some((x) => x.id === obs.id)) return true;
  q.push({ id: obs.id, obs, status: 'pending', tries: 0, error: '' });
  return write(storage, OUTBOX_KEY, q);
}
export const removeFromOutbox = (storage, id) => write(storage, OUTBOX_KEY, outbox(storage).filter((x) => x.id !== id));

// 送出佇列。可重試錯誤（離線、5xx、429 限流）留在 pending；資料錯誤（其他 4xx）標記 failed 並保留原因。
export async function flush(cfg, storage, fetchImpl = globalThis.fetch, token = null) {
  const q = outbox(storage);
  if (!cfg || !q.length) return { sent: 0, failed: 0, pending: q.length };
  const device = deviceHash(storage);
  let sent = 0;
  for (const item of q.filter((x) => x.status === 'pending').slice(0, 50)) {
    item.tries++;
    try {
      const res = await fetchImpl(`${cfg.url}/rest/v1/crowd_observations?on_conflict=client_id`, {
        method: 'POST',
        headers: { ...authHeaders(cfg, token), 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(toRow(item.obs, device)),
      });
      if (res.ok) { item.status = 'sent'; sent++; markUploaded(storage, item.id); continue; }
      const msg = (await res.text().catch(() => '')).slice(0, 200);
      if (res.status === 401) item.error = '登入已過期，請重新登入（資料保留在佇列）';
      else if (res.status === 429 || res.status >= 500) item.error = res.status === 429 ? '回報太頻繁，稍後自動重送' : `伺服器錯誤 ${res.status}`;
      else { item.status = 'failed'; item.error = `資料被拒絕（${res.status}）${msg}`; }
    } catch { item.error = '目前離線，連線後自動重送'; break; }
  }
  const left = q.filter((x) => x.status !== 'sent');
  write(storage, OUTBOX_KEY, left);
  return { sent, failed: left.filter((x) => x.status === 'failed').length, pending: left.filter((x) => x.status === 'pending').length };
}
export const uploadedIds = (storage) => new Set(read(storage, UPLOADED_KEY));
export function markUploaded(storage, id) { const s = uploadedIds(storage); s.add(id); write(storage, UPLOADED_KEY, [...s].slice(-5000)); }
// 本機紀錄中「沒確認上傳過、也不在佇列裡」的（例如設定團隊資料庫之前存的、舊版匯入的）
export function unsentLocal(storage, localList) {
  const up = uploadedIds(storage), q = new Set(outbox(storage).map((x) => x.id));
  return localList.filter((o) => o.placeId && !up.has(o.id) && !q.has(o.id));
}
// 全部排入上傳；伺服器以 client_id 去重，曾經上傳過的會自動略過
export function enqueueAll(storage, list) { let n = 0; for (const o of list) if (enqueue(storage, o)) n++; return n; }
export function retryFailed(storage) {
  return write(storage, OUTBOX_KEY, outbox(storage).map((x) => (x.status === 'failed' ? { ...x, status: 'pending', error: '' } : x)));
}

// 下載團隊已核可資料（只讀公開 view，不含回報者與裝置資訊）
export async function pull(cfg, storage, fetchImpl = globalThis.fetch, token = null) {
  if (!cfg) return { ok: false, error: '未設定' };
  try {
    const res = await fetchImpl(`${cfg.url}/rest/v1/crowd_observations_public?select=*&order=observed_at.desc&limit=5000`, { headers: authHeaders(cfg, token) });
    if (!res.ok) return { ok: false, error: `下載失敗（${res.status}）` };
    const rows = await res.json();
    if (!Array.isArray(rows)) return { ok: false, error: '回應格式錯誤' };
    const list = rows.map((r) => ({ id: String(r.client_id), timestamp: r.observed_at, placeId: r.place_id, crowd: r.crowd_level, queue: r.queue_minutes ?? undefined, method: r.method, remote: true }));
    write(storage, REMOTE_KEY, list);
    return { ok: true, n: list.length, at: new Date().toISOString() };
  } catch { return { ok: false, error: '目前離線' }; }
}
export const remoteObs = (storage) => read(storage, REMOTE_KEY);

// 本機 + 團隊資料合併（以 id/client_id 去重；本機優先）
export function mergeObs(local, remote) {
  const ids = new Set(local.map((o) => o.id));
  return [...local, ...remote.filter((o) => !ids.has(o.id))];
}
