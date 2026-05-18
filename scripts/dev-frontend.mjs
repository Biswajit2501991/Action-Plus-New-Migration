import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadEnvFromFile } from './load-env-file.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

loadEnvFromFile(rootDir);

const frontendPort = Number(process.env.FRONTEND_PORT || 5500);
const frontendHost = process.env.FRONTEND_HOST || '127.0.0.1';
const backendPort = Number(process.env.BACKEND_PORT || process.env.PORT || 4000);
const apiBaseUrl = process.env.API_BASE_URL || '/api';
const backendHost = process.env.BACKEND_HOST || '127.0.0.1';
const supervisorPort = Number(process.env.APG_SUPERVISOR_PORT || 4010);
const SUPERVISOR_PROXY_PREFIX = '/__apg_supervisor';
const API_PROXY_PREFIX = '/api';
const V2_PREFIX = '/v2';
const v2DistDir = path.resolve(rootDir, 'v2', 'dist');
const v2DevOrigin = process.env.V2_DEV_URL || 'http://127.0.0.1:5173';
const v2DevProxy = ['1', 'true', 'yes'].includes(String(process.env.V2_DEV_PROXY || '').toLowerCase());

let supervisorChild = null;
let supervisorChildOwned = false;

function probeSupervisorTcp() {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: supervisorPort, path: '/health', method: 'GET', timeout: 900 },
      (r) => {
        resolve(r.statusCode === 200);
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function ensureLocalSupervisor() {
  if (process.env.APG_SUPERVISOR_AUTOSTART === '0') return;
  if (await probeSupervisorTcp()) return;
  const script = path.join(rootDir, 'scripts', 'apg-supervisor.mjs');
  supervisorChild = spawn(process.execPath, [script], {
    cwd: rootDir,
    env: { ...process.env, APG_SUPERVISOR_PORT: String(supervisorPort) },
    stdio: 'inherit',
  });
  supervisorChildOwned = true;
  supervisorChild.on('exit', () => {
    supervisorChild = null;
    supervisorChildOwned = false;
  });
  for (let i = 0; i < 40; i += 1) {
    await new Promise((r) => setTimeout(r, 250));
    if (await probeSupervisorTcp()) {
      // eslint-disable-next-line no-console
      console.log(`[dev:web] Supervisor ready on 127.0.0.1:${supervisorPort}`);
      return;
    }
  }
  // eslint-disable-next-line no-console
  console.warn(`[dev:web] Supervisor did not respond on :${supervisorPort} (Backend tab restart may fail until it is running).`);
}

function proxyToSupervisor(clientReq, clientRes) {
  const u = new URL(clientReq.url || '/', `http://${frontendHost}:${frontendPort}`);
  const subPath = u.pathname.slice(SUPERVISOR_PROXY_PREFIX.length) || '/';
  const targetPath = subPath.startsWith('/') ? subPath : `/${subPath}`;

  const hopHeaders = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade',
    'host',
  ]);
  const outHeaders = {};
  for (const [k, v] of Object.entries(clientReq.headers)) {
    if (!v) continue;
    if (hopHeaders.has(k.toLowerCase())) continue;
    outHeaders[k] = v;
  }

  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port: supervisorPort,
      path: targetPath + u.search,
      method: clientReq.method,
      headers: outHeaders,
      timeout: 120000,
    },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(clientRes);
    },
  );
  proxyReq.on('error', (err) => {
    if (clientRes.headersSent) return;
    clientRes.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    clientRes.end(JSON.stringify({ error: 'supervisor-proxy-failed', message: String(err?.message || err) }));
  });
  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!clientRes.headersSent) {
      clientRes.writeHead(504, { 'Content-Type': 'application/json; charset=utf-8' });
      clientRes.end(JSON.stringify({ error: 'supervisor-proxy-timeout' }));
    }
  });
  clientReq.pipe(proxyReq);
}

function proxyToBackend(clientReq, clientRes) {
  const u = new URL(clientReq.url || '/', `http://${frontendHost}:${frontendPort}`);
  const hopHeaders = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade',
    'host',
  ]);
  const outHeaders = {};
  for (const [k, v] of Object.entries(clientReq.headers)) {
    if (!v) continue;
    if (hopHeaders.has(k.toLowerCase())) continue;
    outHeaders[k] = v;
  }

  const proxyReq = http.request(
    {
      hostname: backendHost,
      port: backendPort,
      path: u.pathname + u.search,
      method: clientReq.method,
      headers: outHeaders,
      timeout: 120000,
    },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(clientRes);
    },
  );
  proxyReq.on('error', (err) => {
    if (clientRes.headersSent) return;
    clientRes.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    clientRes.end(JSON.stringify({ error: 'backend-proxy-failed', message: String(err?.message || err) }));
  });
  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!clientRes.headersSent) {
      clientRes.writeHead(504, { 'Content-Type': 'application/json; charset=utf-8' });
      clientRes.end(JSON.stringify({ error: 'backend-proxy-timeout' }));
    }
  });
  clientReq.pipe(proxyReq);
}

const mimeByExt = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
};

function safeResolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '');
  const rel = clean === '' ? 'index.html' : clean;
  const abs = path.resolve(rootDir, rel);
  if (!abs.startsWith(rootDir)) return null;
  return abs;
}

function safeResolveV2File(urlPath) {
  const sub = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/v2\/?/, '');
  const rel = sub === '' ? 'index.html' : sub;
  const abs = path.resolve(v2DistDir, rel);
  if (!abs.startsWith(v2DistDir)) return null;
  return abs;
}

function proxyToV2Dev(clientReq, clientRes) {
  const target = new URL(clientReq.url || '/v2/', v2DevOrigin);
  const hopHeaders = new Set(['connection', 'keep-alive', 'host', 'transfer-encoding', 'upgrade']);
  const outHeaders = {};
  for (const [k, v] of Object.entries(clientReq.headers)) {
    if (!v || hopHeaders.has(k.toLowerCase())) continue;
    outHeaders[k] = v;
  }
  const proxyReq = http.request(
    {
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: target.pathname + target.search,
      method: clientReq.method,
      headers: outHeaders,
    },
    (proxyRes) => {
      clientRes.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(clientRes);
    },
  );
  proxyReq.on('error', (err) => {
    if (clientRes.headersSent) return;
    clientRes.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    clientRes.end(`v2 dev proxy failed: ${err?.message || err}`);
  });
  clientReq.pipe(proxyReq);
}

function serveV2Static(req, res) {
  const u = new URL(req.url || '/', `http://${frontendHost}`);
  let filePath = safeResolveV2File(u.pathname);
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(v2DistDir, 'index.html');
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('v2 build not found — run: npm run build:v2');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': mimeByExt[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const reqPath = req.url || '/';

  if (reqPath === '/app.env.js') {
    const payload = {
      FRONTEND_PORT: frontendPort,
      BACKEND_PORT: backendPort,
      API_BASE_URL: apiBaseUrl,
      SUPERVISOR_URL: `http://127.0.0.1:${supervisorPort}`,
      SUPERVISOR_RELATIVE: SUPERVISOR_PROXY_PREFIX,
      ...(process.env.PROCESS_CONTROL_TOKEN
        ? { PROCESS_CONTROL_TOKEN: process.env.PROCESS_CONTROL_TOKEN }
        : {}),
      V2_VISITORS_ENABLED: ['1', 'true', 'yes'].includes(
        String(process.env.V2_VISITORS_ENABLED || '').toLowerCase(),
      ),
      V2_BASE_PATH: '/v2/',
    };
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(`window.__APG_ENV__ = ${JSON.stringify(payload)};`);
    return;
  }

  if (reqPath === SUPERVISOR_PROXY_PREFIX || reqPath.startsWith(`${SUPERVISOR_PROXY_PREFIX}/`)) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-apg-process-token, X-APG-Process-Token',
        'Access-Control-Max-Age': '86400',
      });
      res.end();
      return;
    }
    proxyToSupervisor(req, res);
    return;
  }

  if (reqPath === API_PROXY_PREFIX || reqPath.startsWith(`${API_PROXY_PREFIX}/`)) {
    proxyToBackend(req, res);
    return;
  }

  if (reqPath === '/visitors' || reqPath.startsWith('/visitors?')) {
    const u = new URL(req.url || '/', `http://${frontendHost}`);
    res.writeHead(302, { Location: `/v2/visitors${u.search}` });
    res.end();
    return;
  }

  if (reqPath === V2_PREFIX || reqPath.startsWith(`${V2_PREFIX}/`)) {
    if (v2DevProxy) {
      proxyToV2Dev(req, res);
    } else {
      serveV2Static(req, res);
    }
    return;
  }

  const abs = safeResolveFile(reqPath);
  if (!abs || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const ext = path.extname(abs).toLowerCase();
  res.writeHead(200, { 'Content-Type': mimeByExt[ext] || 'application/octet-stream' });
  fs.createReadStream(abs).pipe(res);
});

server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    // eslint-disable-next-line no-console
    console.error(
      `[dev:web] Port ${frontendPort} is already in use (often Cursor/VS Code Live Preview on 5500).`,
    );
    // eslint-disable-next-line no-console
    console.error('[dev:web] Set FRONTEND_PORT=5501 in .env (recommended) and restart.');
  } else {
    // eslint-disable-next-line no-console
    console.error('[dev:web] Server error:', err?.message || err);
  }
  process.exit(1);
});

server.listen(frontendPort, frontendHost, async () => {
  await ensureLocalSupervisor();
  // eslint-disable-next-line no-console
  console.log(`Frontend running at http://${frontendHost}:${frontendPort}/index.html`);
  // eslint-disable-next-line no-console
  console.log(`Frontend API base URL: ${apiBaseUrl}`);
  // eslint-disable-next-line no-console
  console.log(`Backend API proxy: http://${frontendHost}:${frontendPort}${API_PROXY_PREFIX} → ${backendHost}:${backendPort}`);
  // eslint-disable-next-line no-console
  console.log(`Supervisor proxy: http://${frontendHost}:${frontendPort}${SUPERVISOR_PROXY_PREFIX} → 127.0.0.1:${supervisorPort}`);
});

function shutdownDev() {
  if (supervisorChildOwned && supervisorChild && !supervisorChild.killed) {
    supervisorChild.kill('SIGTERM');
  }
  process.exit(0);
}
process.on('SIGINT', shutdownDev);
process.on('SIGTERM', shutdownDev);
