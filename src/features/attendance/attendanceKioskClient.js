/**
 * Client helpers for Attendance QR kiosk (Settings + optional in-app scan).
 */

const KIOSK_CREDS_STORAGE_KEY = 'apg.attendanceKiosk.creds.v1';

export function buildAttendanceKioskViewUrl({ apiOrigin = '', gymCode, deviceToken }) {
  // Production-friendly path (Cloudflare / bookmarks use /attendance/kiosk).
  const code = encodeURIComponent(String(gymCode || '').trim());
  const token = encodeURIComponent(String(deviceToken || '').trim());
  const path = `/attendance/kiosk?gym=${code}&device=${token}`;
  const base = String(apiOrigin || '').replace(/\/$/, '');
  if (base && !base.endsWith('/api')) return `${base}${path}`;
  return path;
}

/** Absolute URL safe to open on a tablet (same origin as the app). */
export function toAbsoluteKioskUrl(urlOrPath, origin = '') {
  const raw = String(urlOrPath || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = String(origin || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
  if (!base) return raw;
  return raw.startsWith('/') ? `${base}${raw}` : `${base}/${raw}`;
}

function readCredsMap() {
  try {
    const raw = localStorage.getItem(KIOSK_CREDS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function readSavedAttendanceKioskCreds(branchId) {
  const id = String(branchId || '').trim();
  if (!id) return null;
  const row = readCredsMap()[id];
  if (!row || !row.url || !row.token) return null;
  return {
    url: String(row.url),
    token: String(row.token),
    deviceId: row.deviceId || '',
    gymCode: row.gymCode || '',
    savedAt: row.savedAt || '',
  };
}

export function saveAttendanceKioskCreds(branchId, { url, token, deviceId, gymCode }) {
  const id = String(branchId || '').trim();
  if (!id || !url || !token) return null;
  const map = readCredsMap();
  map[id] = {
    url: String(url),
    token: String(token),
    deviceId: String(deviceId || ''),
    gymCode: String(gymCode || ''),
    savedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(KIOSK_CREDS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
  return map[id];
}

export function clearSavedAttendanceKioskCreds(branchId) {
  const id = String(branchId || '').trim();
  if (!id) return;
  const map = readCredsMap();
  delete map[id];
  try {
    localStorage.setItem(KIOSK_CREDS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/**
 * Open always-on public kiosk (no staff login). Reuses saved device token when present.
 */
export async function ensureAndOpenAttendanceKiosk(backendJson, {
  gymCodeId,
  gymCode,
  label = 'Reception Kiosk',
  openWindow = true,
} = {}) {
  const branchId = String(gymCodeId || '').trim();
  const code = String(gymCode || branchId).trim();
  if (!branchId) {
    const err = new Error('Select a gym branch first.');
    err.status = 400;
    throw err;
  }
  if (typeof backendJson !== 'function') {
    const err = new Error('Backend sync required to open the attendance kiosk.');
    err.status = 503;
    throw err;
  }

  const saved = readSavedAttendanceKioskCreds(branchId);
  if (saved?.url && saved?.token) {
    // Prefer rebuilding from token so old in-app/session URLs are never reused.
    const url = toAbsoluteKioskUrl(buildAttendanceKioskViewUrl({
      gymCode: saved.gymCode || code,
      deviceToken: saved.token,
    }));
    saveAttendanceKioskCreds(branchId, {
      url,
      token: saved.token,
      deviceId: saved.deviceId,
      gymCode: saved.gymCode || code,
    });
    if (openWindow && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    return { url, token: saved.token, created: false, deviceId: saved.deviceId };
  }

  let created;
  try {
    created = await createAttendanceKioskDevice(backendJson, { gymCodeId: branchId, label });
  } catch (err) {
    const msg = String(err?.message || err || '');
    if (/401|unauthor|session|sign in|login/i.test(msg)) {
      const friendly = new Error(
        'Admin session expired. Sign in once as owner, click Open Attendance QR kiosk again, then leave that new tab open on the tablet (no login on the tablet).',
      );
      friendly.status = 401;
      throw friendly;
    }
    throw err;
  }
  const relative = buildAttendanceKioskViewUrl({
    gymCode: code,
    deviceToken: created.token,
  });
  const url = toAbsoluteKioskUrl(relative);
  saveAttendanceKioskCreds(branchId, {
    url,
    token: created.token,
    deviceId: created.device?.id,
    gymCode: code,
  });
  if (openWindow && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  return {
    url,
    token: created.token,
    created: true,
    deviceId: created.device?.id || '',
  };
}

export async function listAttendanceKioskDevices(backendJson, { gymCodeId } = {}) {
  const q = gymCodeId ? `?gymCodeId=${encodeURIComponent(gymCodeId)}` : '';
  return backendJson(`/attendance-kiosk/devices${q}`);
}

export async function createAttendanceKioskDevice(backendJson, { gymCodeId, label }) {
  return backendJson('/attendance-kiosk/devices', {
    method: 'POST',
    body: JSON.stringify({ gymCodeId, label }),
  });
}

export async function revokeAttendanceKioskDevice(backendJson, deviceId) {
  return backendJson(`/attendance-kiosk/devices/${encodeURIComponent(deviceId)}`, {
    method: 'DELETE',
  });
}

export async function scanAttendanceQr(backendJson, { qrPayload, code, branchId, type = 'login' }) {
  return backendJson('/attendance-kiosk/qr-scan', {
    method: 'POST',
    body: JSON.stringify({ qrPayload, code, branchId, type }),
  });
}

export function playAttendanceSuccessSound(ok = true) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = ok ? 880 : 220;
    g.gain.value = 0.08;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => {
      try { o.stop(); ctx.close(); } catch { /* ignore */ }
    }, ok ? 160 : 280);
  } catch {
    /* ignore */
  }
}

export const ATTENDANCE_PUNCH_METHODS = [
  { key: 'qr', label: 'QR scan (kiosk wall + staff phone)' },
  { key: 'pin', label: 'PIN fallback (Staff ID + password on kiosk)' },
  { key: 'login', label: 'Login punch (existing app login/logout)' },
];
