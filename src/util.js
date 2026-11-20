// 共用工具：跳脫字元、時間（台灣時區）、ID、下載
export const TZ = 'Asia/Taipei';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const toMin = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };
export const fmt = (n) => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(Math.round(n % 60)).padStart(2, '0');
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

const DAY_EN = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export const DAYS = ['日', '一', '二', '三', '四', '五', '六'];

// 現在的台灣時間（與裝置時區無關）
export function nowTW(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' })
      .formatToParts(date).map((p) => [p.type, p.value]),
  );
  const hour = Number(parts.hour) % 24;
  return {
    day: DAY_EN[parts.weekday], minute: hour * 60 + Number(parts.minute),
    label: `${parts.year}年${Number(parts.month)}月${Number(parts.day)}日 週${DAYS[DAY_EN[parts.weekday]]}`,
  };
}

// ISO 時間 → 台灣時間顯示（YYYY/MM/DD HH:mm）
export function fmtTW(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '時間格式錯誤';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}/${p.month}/${p.day} ${String(Number(p.hour) % 24).padStart(2, '0')}:${p.minute}`;
}
// ISO（帶 +08:00 偏移）供 CSV 使用，格式固定
export function isoTW(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${String(Number(p.hour) % 24).padStart(2, '0')}:${p.minute}:${p.second}+08:00`;
}

export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── CSV ──
const q = (x) => '"' + String(x ?? '').replace(/"/g, '""') + '"';
export const toCSV = (header, rows) => [header.map(q).join(','), ...rows.map((r) => r.map(q).join(','))].join('\r\n');
export function parseCSV(text) {
  const rows = []; let row = [], cur = '', inQ = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((c) => c !== '')) rows.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur); if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}
