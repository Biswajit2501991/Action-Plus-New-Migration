function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Fullscreen attendance kiosk HTML — display QR + PIN fallback + countdown + sound.
 */
export function renderAttendanceKioskHtml({
  gymCode,
  branchName = '',
  deviceToken = '',
  apiBase = '/api/public/attendance-kiosk',
}) {
  const title = branchName
    ? `Staff Attendance — ${branchName}`
    : `Staff Attendance — ${gymCode}`;
  const safeCode = escapeHtml(gymCode);
  const safeToken = escapeHtml(deviceToken);
  const safeTitle = escapeHtml(title);
  const safeApi = escapeHtml(apiBase);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="robots" content="noindex,nofollow" />
  <title>${safeTitle}</title>
  <style>
    :root {
      --bg: #0b1220;
      --panel: #121a2b;
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: #38bdf8;
      --ok: #34d399;
      --warn: #fbbf24;
      --err: #fb7185;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: radial-gradient(1200px 600px at 50% -10%, #1e293b, var(--bg)); color: var(--text); font-family: "Segoe UI", system-ui, sans-serif; }
    .wrap { max-width: 920px; margin: 0 auto; padding: 24px 16px 48px; }
    h1 { font-size: clamp(1.4rem, 3vw, 2rem); margin: 0 0 6px; letter-spacing: 0.02em; }
    .sub { color: var(--muted); margin-bottom: 20px; }
    .tabs { display: flex; gap: 8px; margin-bottom: 18px; flex-wrap: wrap; }
    .tab { border: 1px solid #334155; background: #0f172a; color: var(--text); border-radius: 999px; padding: 10px 16px; font-weight: 600; cursor: pointer; }
    .tab[aria-selected="true"] { background: var(--accent); color: #0b1220; border-color: var(--accent); }
    .panel { background: color-mix(in srgb, var(--panel) 92%, black); border: 1px solid #243044; border-radius: 24px; padding: 22px; }
    .qr-box { display: grid; place-items: center; background: #fff; border-radius: 20px; padding: 18px; min-height: 280px; }
    #qrImg { width: min(72vw, 360px); height: auto; display: block; }
    .countdown { margin-top: 18px; text-align: center; }
    .countdown .secs { font-size: clamp(3rem, 12vw, 5.5rem); font-weight: 800; line-height: 1; color: var(--accent); }
    .countdown .label { color: var(--muted); margin-top: 4px; font-size: 0.95rem; }
    .meta { margin-top: 14px; display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; color: var(--muted); font-size: 0.85rem; }
    .chip { border: 1px solid #334155; border-radius: 999px; padding: 4px 10px; }
    .punches { margin-top: 18px; }
    .punches h2 { font-size: 0.95rem; color: var(--muted); margin: 0 0 8px; font-weight: 600; }
    .punch { display: flex; justify-content: space-between; gap: 8px; padding: 8px 0; border-bottom: 1px solid #1f2a3d; font-size: 0.92rem; }
    form { display: grid; gap: 12px; max-width: 420px; margin: 0 auto; }
    label { font-size: 0.85rem; color: var(--muted); }
    input, select, button.primary {
      width: 100%; border-radius: 12px; border: 1px solid #334155; background: #0b1220; color: var(--text);
      padding: 12px 14px; font-size: 1rem;
    }
    button.primary { background: var(--accent); color: #082f49; border: none; font-weight: 700; cursor: pointer; }
    button.primary:disabled { opacity: 0.6; cursor: wait; }
    .hint { color: var(--muted); font-size: 0.85rem; text-align: center; margin-top: 12px; }
    .toast {
      position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%);
      background: #064e3b; color: #ecfdf5; border: 1px solid #34d399; border-radius: 14px;
      padding: 12px 18px; font-weight: 600; opacity: 0; pointer-events: none; transition: opacity .2s;
      z-index: 50; max-width: min(90vw, 420px); text-align: center;
    }
    .toast.show { opacity: 1; }
    .toast.err { background: #4c0519; border-color: var(--err); color: #ffe4e6; }
    .err-banner { background: #4c0519; border: 1px solid var(--err); color: #fecdd3; border-radius: 14px; padding: 12px 14px; margin-bottom: 14px; }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${safeTitle}</h1>
    <p class="sub">Staff scan this QR with their phone → staff login opens → check in/out. PIN tab and app login punch still work.</p>
    <div id="errBanner" class="err-banner hidden"></div>
    <div class="tabs" role="tablist">
      <button type="button" class="tab" id="tabDisplay" role="tab" aria-selected="true">QR Display</button>
      <button type="button" class="tab" id="tabPin" role="tab" aria-selected="false">PIN Fallback</button>
    </div>
    <section id="panelDisplay" class="panel" role="tabpanel">
      <div class="qr-box"><img id="qrImg" alt="Staff attendance QR" width="360" height="360" /></div>
      <div class="countdown">
        <div class="secs" id="secsLeft">--</div>
        <div class="label">seconds until QR refreshes · offline grace ${Math.round(90)}s</div>
      </div>
      <div class="meta">
        <span class="chip" id="branchChip">Branch: ${safeCode}</span>
        <span class="chip" id="methodChip">Methods: QR · PIN · Login</span>
      </div>
      <div class="punches">
        <h2>Recent check-ins</h2>
        <div id="punchList"><div class="punch"><span>Waiting for scans…</span></div></div>
      </div>
    </section>
    <section id="panelPin" class="panel hidden" role="tabpanel">
      <form id="pinForm">
        <div>
          <label for="staffId">Staff ID / Email</label>
          <input id="staffId" name="identifier" autocomplete="username" required />
        </div>
        <div>
          <label for="staffPin">Password / PIN</label>
          <input id="staffPin" name="password" type="password" autocomplete="current-password" required />
        </div>
        <div>
          <label for="punchType">Action</label>
          <select id="punchType" name="type">
            <option value="login">Check in</option>
            <option value="logout">Check out</option>
          </select>
        </div>
        <button class="primary" type="submit" id="pinSubmit">Mark attendance</button>
      </form>
      <p class="hint">PIN uses your staff login password. Optional live QR on this device is attached automatically when available.</p>
    </section>
  </div>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
  <script>
(function () {
  const gymCode = ${JSON.stringify(String(gymCode || ''))};
  const deviceToken = ${JSON.stringify(String(deviceToken || ''))};
  const apiBase = ${JSON.stringify(String(apiBase || '/api/public/attendance-kiosk'))};
  const challengeUrl = apiBase.replace(/\\/$/, '') + '/' + encodeURIComponent(gymCode) + '/challenge?device=' + encodeURIComponent(deviceToken);
  const pinUrl = apiBase.replace(/\\/$/, '') + '/pin-punch';

  let latestPayload = '';
  let expiresAt = 0;
  let pollTimer = null;
  let tickTimer = null;

  const els = {
    err: document.getElementById('errBanner'),
    secs: document.getElementById('secsLeft'),
    punchList: document.getElementById('punchList'),
    toast: document.getElementById('toast'),
    tabDisplay: document.getElementById('tabDisplay'),
    tabPin: document.getElementById('tabPin'),
    panelDisplay: document.getElementById('panelDisplay'),
    panelPin: document.getElementById('panelPin'),
    pinForm: document.getElementById('pinForm'),
    pinSubmit: document.getElementById('pinSubmit'),
    qrImg: document.getElementById('qrImg'),
  };

  function showToast(msg, isErr) {
    els.toast.textContent = msg || '';
    els.toast.classList.toggle('err', Boolean(isErr));
    els.toast.classList.add('show');
    setTimeout(() => els.toast.classList.remove('show'), 3200);
  }

  function playBeep(ok) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = ok ? 880 : 220;
      g.gain.value = 0.08;
      o.connect(g); g.connect(ctx.destination);
      o.start();
      setTimeout(() => { o.stop(); ctx.close(); }, ok ? 160 : 280);
    } catch (_) {}
  }

  function setTab(which) {
    const display = which === 'display';
    els.tabDisplay.setAttribute('aria-selected', display ? 'true' : 'false');
    els.tabPin.setAttribute('aria-selected', display ? 'false' : 'true');
    els.panelDisplay.classList.toggle('hidden', !display);
    els.panelPin.classList.toggle('hidden', display);
  }
  els.tabDisplay.addEventListener('click', () => setTab('display'));
  els.tabPin.addEventListener('click', () => setTab('pin'));

  function renderPunches(list) {
    const rows = Array.isArray(list) ? list : [];
    if (!rows.length) {
      els.punchList.innerHTML = '<div class="punch"><span>Waiting for scans…</span></div>';
      return;
    }
    els.punchList.innerHTML = rows.map((p) => {
      const name = String(p.staffName || p.userId || 'Staff');
      const kind = p.punchType === 'logout' ? 'Out' : 'In';
      const method = String(p.method || 'qr');
      const at = p.at ? new Date(p.at).toLocaleTimeString() : '';
      return '<div class="punch"><span>' + name + ' · ' + kind + ' (' + method + ')</span><span>' + at + '</span></div>';
    }).join('');
  }

  function drawQr(dataUrl) {
    if (!els.qrImg || !dataUrl) return;
    els.qrImg.src = dataUrl;
  }

  function tick() {
    const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    els.secs.textContent = String(left).padStart(2, '0');
    if (left <= 5) els.secs.style.color = '#fbbf24';
    else els.secs.style.color = '#38bdf8';
  }

  async function pullChallenge() {
    try {
      const res = await fetch(challengeUrl, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        els.err.classList.remove('hidden');
        els.err.textContent = data.message || data.error || ('Kiosk error ' + res.status);
        return;
      }
      els.err.classList.add('hidden');
      latestPayload = data.qrPayload || '';
      expiresAt = Number(data.expiresAt) || (Date.now() + (data.refreshInMs || 60000));
      drawQr(data.qrDataUrl || '');
      if (!data.qrDataUrl) {
        els.err.classList.remove('hidden');
        els.err.textContent = 'QR image missing from server — refresh the page.';
      }
      renderPunches(data.recentPunches);
      tick();
    } catch (e) {
      els.err.classList.remove('hidden');
      els.err.textContent = 'Network blip — last QR stays valid for ~90s grace.';
    }
  }

  els.pinForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    els.pinSubmit.disabled = true;
    try {
      const body = {
        identifier: document.getElementById('staffId').value,
        password: document.getElementById('staffPin').value,
        type: document.getElementById('punchType').value,
        qrPayload: latestPayload || undefined,
        branchId: gymCode,
      };
      const res = await fetch(pinUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        playBeep(false);
        showToast(data.message || data.error || 'PIN punch failed', true);
        return;
      }
      playBeep(true);
      showToast(data.toast || 'Attendance marked');
      document.getElementById('staffPin').value = '';
      pullChallenge();
    } catch (_) {
      playBeep(false);
      showToast('Network error', true);
    } finally {
      els.pinSubmit.disabled = false;
    }
  });

  if (!deviceToken) {
    els.err.classList.remove('hidden');
    els.err.textContent = 'Missing device token. Open this page from Settings → System Features → Attendance QR Kiosk.';
  } else {
    pullChallenge();
    pollTimer = setInterval(pullChallenge, 5000);
    tickTimer = setInterval(tick, 250);
  }
})();
  </script>
</body>
</html>`;
}

/**
 * Phone-camera landing page after scanning the wall QR — staff login + punch.
 */
export function renderAttendanceScanHtml({
  gymCode,
  branchName = '',
  qrPayload = '',
  apiBase = '/api/public/attendance-kiosk',
}) {
  const title = branchName
    ? `Staff Attendance — ${branchName}`
    : `Staff Attendance — ${gymCode}`;
  const safeTitle = escapeHtml(title);
  const safeCode = escapeHtml(gymCode);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="robots" content="noindex,nofollow" />
  <title>${safeTitle}</title>
  <style>
    :root {
      --bg: #0b1220; --panel: #121a2b; --text: #f8fafc; --muted: #94a3b8;
      --accent: #38bdf8; --ok: #34d399; --err: #fb7185;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; min-height: 100%;
      background: radial-gradient(1200px 600px at 50% -10%, #1e293b, var(--bg));
      color: var(--text); font-family: "Segoe UI", system-ui, sans-serif;
    }
    .wrap { max-width: 440px; margin: 0 auto; padding: 28px 16px 48px; }
    h1 { font-size: 1.45rem; margin: 0 0 6px; }
    .sub { color: var(--muted); margin-bottom: 18px; font-size: 0.95rem; }
    .panel { background: color-mix(in srgb, var(--panel) 92%, black); border: 1px solid #243044; border-radius: 20px; padding: 20px; }
    form { display: grid; gap: 12px; }
    label { font-size: 0.85rem; color: var(--muted); }
    input, select, button.primary {
      width: 100%; border-radius: 12px; border: 1px solid #334155; background: #0b1220; color: var(--text);
      padding: 12px 14px; font-size: 1rem;
    }
    button.primary { background: var(--accent); color: #082f49; border: none; font-weight: 700; cursor: pointer; }
    button.primary:disabled { opacity: 0.6; cursor: wait; }
    .chip { display: inline-block; border: 1px solid #334155; border-radius: 999px; padding: 4px 10px; color: var(--muted); font-size: 0.85rem; margin-bottom: 14px; }
    .err { background: #4c0519; border: 1px solid var(--err); color: #fecdd3; border-radius: 14px; padding: 12px 14px; margin-bottom: 14px; }
    .ok { background: #064e3b; border: 1px solid var(--ok); color: #ecfdf5; border-radius: 14px; padding: 12px 14px; margin-bottom: 14px; }
    .hidden { display: none !important; }
    .hint { color: var(--muted); font-size: 0.82rem; margin-top: 14px; text-align: center; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${safeTitle}</h1>
    <p class="sub">Sign in with your staff ID to mark attendance for this branch.</p>
    <span class="chip">Branch: ${safeCode}</span>
    <div id="banner" class="err hidden"></div>
    <section class="panel">
      <form id="scanForm">
        <div>
          <label for="staffId">Staff ID / Email</label>
          <input id="staffId" name="identifier" autocomplete="username" required autofocus />
        </div>
        <div>
          <label for="staffPin">Password / PIN</label>
          <input id="staffPin" name="password" type="password" autocomplete="current-password" required />
        </div>
        <div>
          <label for="punchType">Action</label>
          <select id="punchType" name="type">
            <option value="login">Check in</option>
            <option value="logout">Check out</option>
          </select>
        </div>
        <button class="primary" type="submit" id="submitBtn">Mark attendance</button>
      </form>
    </section>
    <p class="hint">This page opened from the wall QR. Keep the QR fresh on the display if check-in fails.</p>
  </div>
  <script>
(function () {
  const gymCode = ${JSON.stringify(String(gymCode || ''))};
  const apiBase = ${JSON.stringify(String(apiBase || '/api/public/attendance-kiosk'))};
  const params = new URLSearchParams(window.location.search);
  let qrPayload = ${JSON.stringify(String(qrPayload || ''))}
    || params.get('p')
    || params.get('payload')
    || params.get('qr')
    || '';

  const banner = document.getElementById('banner');
  const form = document.getElementById('scanForm');
  const submitBtn = document.getElementById('submitBtn');

  function showBanner(msg, ok) {
    banner.textContent = msg || '';
    banner.classList.toggle('hidden', !msg);
    banner.classList.toggle('err', !ok);
    banner.classList.toggle('ok', Boolean(ok));
  }

  if (!qrPayload) {
    showBanner('Missing QR payload. Scan the wall QR again.', false);
  }

  form.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    submitBtn.disabled = true;
    showBanner('', false);
    try {
      const body = {
        identifier: document.getElementById('staffId').value,
        password: document.getElementById('staffPin').value,
        type: document.getElementById('punchType').value,
        qrPayload: qrPayload || undefined,
        branchId: gymCode,
      };
      const res = await fetch(apiBase.replace(/\\/$/, '') + '/pin-punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        showBanner(data.message || data.error || ('Failed (' + res.status + ')'), false);
        return;
      }
      showBanner(data.toast || 'Attendance marked', true);
      document.getElementById('staffPin').value = '';
    } catch (e) {
      showBanner('Network error — try again.', false);
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
  </script>
</body>
</html>`;
}
