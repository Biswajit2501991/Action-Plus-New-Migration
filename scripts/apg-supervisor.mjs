/**
 * Local supervisor: keeps running while the desktop bootstrap is alive.
 * Listens on 127.0.0.1 only so remote machines cannot call it.
 * Manages the backend dev process (npm run dev in backend/).
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');

const PORT = Number(process.env.APG_SUPERVISOR_PORT || 4010);
const HOST = process.env.APG_SUPERVISOR_HOST || '127.0.0.1';
const TOKEN = String(process.env.APG_SUPERVISOR_TOKEN || process.env.PROCESS_CONTROL_TOKEN || '').trim();

let backendChild = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-apg-process-token, X-APG-Process-Token');
}

function authOk(req) {
  if (!TOKEN) return true;
  const h = req.headers['x-apg-process-token'];
  const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return h === TOKEN || auth === TOKEN;
}

function sendJson(res, status, body) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function attachBackendCloseHandler(child) {
  child.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[supervisor] backend spawn error:', err?.message || err);
  });
  child.on('close', (code) => {
    // eslint-disable-next-line no-console
    console.log(`[supervisor] backend exited with code ${code}`);
    if (backendChild === child) backendChild = null;
  });
}

function startBackend() {
  if (backendChild && !backendChild.killed) {
    return { ok: true, message: 'Backend process already running.' };
  }
  if (backendChild && backendChild.killed) {
    backendChild = null;
  }
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  backendChild = spawn(npmCmd, ['run', 'dev'], {
    cwd: backendDir,
    env: { ...process.env },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  attachBackendCloseHandler(backendChild);
  return { ok: true, message: 'Backend start command launched.' };
}

/** Stop: signal only. Do not clear backendChild here — let 'close' run first (otherwise restart/start races the old process). */
function stopBackend() {
  if (!backendChild || backendChild.killed) {
    if (backendChild?.killed) backendChild = null;
    return { ok: true, message: 'Backend was not running.' };
  }
  try {
    backendChild.kill('SIGTERM');
  } catch {}
  return { ok: true, message: 'Backend stop signal sent.' };
}

async function waitForBackendExit(maxMs = 15000) {
  if (!backendChild) return;
  const ch = backendChild;
  await new Promise((resolve) => {
    const t = setTimeout(() => {
      try {
        ch.kill('SIGKILL');
      } catch {}
      resolve();
    }, maxMs);
    ch.once('close', () => {
      clearTimeout(t);
      resolve();
    });
  });
  if (backendChild === ch) backendChild = null;
  await sleep(600);
}

async function restartBackendAsync() {
  if (backendChild && !backendChild.killed) {
    try {
      backendChild.kill('SIGTERM');
    } catch {}
    await waitForBackendExit();
  } else if (backendChild) {
    await waitForBackendExit();
  }
  return startBackend();
}

async function startBackendAsync() {
  if (backendChild && !backendChild.killed) {
    return { ok: true, message: 'Backend process already running.' };
  }
  if (backendChild) {
    await waitForBackendExit();
  }
  return startBackend();
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204).end();
    return;
  }
  const url = new URL(req.url || '/', `http://${HOST}:${PORT}`);
  const p = url.pathname.replace(/\/$/, '') || '/';

  if (p === '/health' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, service: 'apg-supervisor', backendPid: backendChild?.pid || null });
  }

  if (!authOk(req)) {
    return sendJson(res, 401, { error: 'unauthorized', message: 'Invalid or missing supervisor token.' });
  }

  if (req.method === 'POST' && p === '/backend/start') {
    (async () => {
      try {
        const out = await startBackendAsync();
        sendJson(res, 200, out);
      } catch (e) {
        sendJson(res, 500, { ok: false, message: String(e?.message || e) });
      }
    })();
    return;
  }
  if (req.method === 'POST' && p === '/backend/stop') {
    const out = stopBackend();
    return sendJson(res, 200, out);
  }
  if (req.method === 'POST' && p === '/backend/restart') {
    (async () => {
      try {
        const out = await restartBackendAsync();
        sendJson(res, 200, out);
      } catch (e) {
        sendJson(res, 500, { ok: false, message: String(e?.message || e) });
      }
    })();
    return;
  }

  cors(res);
  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'not-found' }));
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[supervisor] listening on http://${HOST}:${PORT}`);
  startBackend();
});

server.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('[supervisor] failed to listen:', err?.message || err);
  process.exit(1);
});
