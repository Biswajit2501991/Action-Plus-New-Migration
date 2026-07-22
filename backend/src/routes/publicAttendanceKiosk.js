import { Router } from 'express';
import { clientIp } from '../middleware/loginRateLimit.js';
import { resolveAttendanceKioskDevice } from '../services/attendance/kioskDevices.js';
import { rotateAttendancePresenceToken } from '../services/attendance/presenceTokens.js';

const router = Router();

/** @type {Map<string, { count: number, resetAt: number }>} */
const buckets = new Map();
const MAX = 60;
const WINDOW_MS = 60 * 1000;

function rateLimit(req, res, next) {
  const ip = clientIp(req);
  const now = Date.now();
  let entry = buckets.get(ip);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(ip, entry);
  }
  entry.count += 1;
  if (entry.count > MAX) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      error: 'too-many-requests',
      message: 'Too many kiosk refresh attempts. Try again shortly.',
      retryAfterSec,
    });
  }
  return next();
}

function deviceFromRequest(req) {
  return String(
    req.query?.device || req.query?.token || req.body?.device || req.headers['x-kiosk-device'] || '',
  ).trim();
}

/**
 * GET /api/public/attendance-kiosk/:gymCode/rotate?device=...
 * Rotate presence QR for a valid always-on device token (no staff login).
 */
router.get('/:gymCode/rotate', rateLimit, async (req, res) => {
  try {
    const gymCode = String(req.params.gymCode || '').trim();
    const deviceToken = deviceFromRequest(req);
    const device = await resolveAttendanceKioskDevice(deviceToken, gymCode);
    if (!device?.gymCodeId) {
      return res.status(401).json({
        error: 'invalid-device',
        message: 'Invalid or revoked kiosk device. Open a new kiosk URL from Settings.',
      });
    }

    const rotated = rotateAttendancePresenceToken(device.gymCodeId);
    const claimPath = `/attendance/claim?t=${encodeURIComponent(rotated.token)}`;
    return res.json({
      ok: true,
      ...rotated,
      claimPath,
      gymCode: device.gymCode || gymCode,
      label: device.label || 'Reception Kiosk',
    });
  } catch (err) {
    return res.status(err?.status || 500).json({
      error: err?.code || err?.message || 'kiosk-rotate-failed',
      message: err?.detail || err?.message || 'Unable to refresh punch QR.',
    });
  }
});

/**
 * GET /api/public/attendance-kiosk/:gymCode/view?device=...
 * Self-contained HTML kiosk (works when opened via API rewrite; no React login shell).
 */
router.get('/:gymCode/view', rateLimit, async (req, res) => {
  try {
    const gymCode = String(req.params.gymCode || '').trim();
    const deviceToken = deviceFromRequest(req);
    const device = await resolveAttendanceKioskDevice(deviceToken, gymCode);
    if (!device?.gymCodeId) {
      res.status(401).type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Punch QR Kiosk</title></head>
<body style="margin:0;font-family:system-ui;background:#020617;color:#fecaca;display:grid;place-items:center;min-height:100vh;padding:24px;text-align:center">
  <div><h1>Kiosk link invalid</h1><p>Open a new always-on punch QR URL from Settings (owner).</p></div>
</body></html>`);
      return;
    }

    const safeCode = JSON.stringify(gymCode);
    const safeDevice = JSON.stringify(deviceToken);
    const label = String(device.label || 'Reception Kiosk').replace(/[<>&"]/g, '');

    res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta name="robots" content="noindex"/>
  <title>Always-on Punch QR · ${label}</title>
  <style>
    :root { color-scheme: dark; }
    body { margin:0; min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center;
      background:#020617; color:#e2e8f0; font-family: ui-sans-serif, system-ui, sans-serif; padding:24px; text-align:center; }
    .eyebrow { letter-spacing:.25em; text-transform:uppercase; font-size:11px; color:#5eead4; font-weight:600; }
    h1 { margin:12px 0 8px; font-size:clamp(1.4rem,3vw,2rem); font-weight:600; }
    p { color:#94a3b8; max-width:28rem; line-height:1.5; font-size:14px; }
    .card { margin-top:28px; background:#fff; border-radius:24px; padding:16px; box-shadow:0 25px 50px rgba(0,0,0,.45); }
    img { width:min(80vw,320px); height:min(80vw,320px); display:block; }
    .meta { margin-top:16px; font-size:12px; color:#64748b; }
    .err { color:#fda4af; margin-top:16px; }
    button { margin-top:20px; border:1px solid rgba(255,255,255,.2); background:transparent; color:#e2e8f0;
      border-radius:12px; padding:10px 16px; cursor:pointer; font-size:14px; }
  </style>
</head>
<body>
  <p class="eyebrow">Always-on punch QR</p>
  <h1>Staff: scan to enable today&rsquo;s Time In</h1>
  <p>This tablet stays signed out. The code refreshes automatically.</p>
  <div class="card"><img id="qr" alt="Punch QR" width="320" height="320"/></div>
  <p class="meta" id="meta">Loading…</p>
  <p class="err" id="err" hidden></p>
  <button type="button" id="refresh">Refresh now</button>
  <script>
    const gymCode = ${safeCode};
    const device = ${safeDevice};
    const qrEl = document.getElementById('qr');
    const metaEl = document.getElementById('meta');
    const errEl = document.getElementById('err');
    let timer = null;

    function qrUrl(data) {
      return 'https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=' + encodeURIComponent(data);
    }

    async function rotate() {
      errEl.hidden = true;
      try {
        const res = await fetch('/api/public/attendance-kiosk/' + encodeURIComponent(gymCode) + '/rotate?device=' + encodeURIComponent(device), {
          credentials: 'omit',
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || data.error || ('HTTP ' + res.status));
        const claimUrl = location.origin + (data.claimPath || ('/attendance/claim?t=' + encodeURIComponent(data.token)));
        qrEl.src = qrUrl(claimUrl);
        const until = data.expiresAt ? new Date(data.expiresAt).toLocaleTimeString() : '';
        metaEl.textContent = 'Rotates automatically' + (until ? ' · valid until ' + until : '');
        const waitMs = Math.max(15000, Math.floor((Number(data.expiresInSec) || 90) * 1000 * 0.55));
        clearTimeout(timer);
        timer = setTimeout(rotate, waitMs);
      } catch (e) {
        errEl.hidden = false;
        errEl.textContent = e && e.message ? e.message : 'Could not refresh QR';
        clearTimeout(timer);
        timer = setTimeout(rotate, 20000);
      }
    }

    document.getElementById('refresh').addEventListener('click', () => { void rotate(); });
    void rotate();
  </script>
</body>
</html>`);
  } catch (err) {
    return res.status(500).type('html').send(`<!doctype html><html><body style="background:#020617;color:#fecaca;font-family:system-ui;padding:24px">
      <h1>Kiosk error</h1><p>${String(err?.message || err)}</p></body></html>`);
  }
});

export default router;
