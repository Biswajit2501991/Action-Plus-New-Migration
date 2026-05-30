import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadEnvFromFile } from './load-env-file.mjs';
import { securityHeaders } from './security-headers.mjs';
import { resolveAuthSessionTiming } from '../src/shared/authSessionTiming.js';
import { parseAuthCookieMode } from '../src/shared/authCookieMode.js';
import {
  isSupervisorMutationPath,
  verifySupervisorProxyOwner,
} from './supervisor-proxy-auth.mjs';

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
const supervisorAuthToken = String(
  process.env.APG_SUPERVISOR_TOKEN || process.env.PROCESS_CONTROL_TOKEN || '',
).trim();
const API_PROXY_PREFIX = '/api';
const V2_PREFIX = '/v2';
const v2DistDir = path.resolve(rootDir, 'v2', 'dist');
const v2DevOrigin = process.env.V2_DEV_URL || 'http://127.0.0.1:5173';
const v2DevProxy = ['1', 'true', 'yes'].includes(String(process.env.V2_DEV_PROXY || '').toLowerCase());
const legacyProdDir = path.resolve(rootDir, 'dist-legacy');
const legacyProdIndex = path.join(legacyProdDir, 'index.html');
const useLegacyProdBundle = ['1', 'true', 'yes'].includes(
  String(process.env.APG_USE_PROD_BUNDLE ?? '1').toLowerCase(),
);
const securityHeadersEnabled = !['0', 'false', 'no'].includes(
  String(process.env.APG_SECURITY_HEADERS ?? '1').toLowerCase(),
);
const cspReportOnly = ['1', 'true', 'yes'].includes(
  String(process.env.APG_CSP_REPORT_ONLY || '').toLowerCase(),
);

function readBackendJwtExpiresIn() {
  if (process.env.JWT_EXPIRES_IN) return process.env.JWT_EXPIRES_IN;
  const backendEnv = path.join(rootDir, 'backend', '.env');
  try {
    const raw = fs.readFileSync(backendEnv, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (!trimmed.startsWith('JWT_EXPIRES_IN=')) continue;
      let value = trimmed.slice('JWT_EXPIRES_IN='.length).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return value;
    }
  } catch {
    // backend/.env optional in dev
  }
  return undefined;
}

const authSessionTiming = resolveAuthSessionTiming(
  readBackendJwtExpiresIn(),
  process.env.APG_AUTH_SESSION_IDLE_MS,
);
const authCookieMode = parseAuthCookieMode(process.env.APG_AUTH_COOKIE_MODE);
const supervisorProxyRequireOwner = !['0', 'false', 'no'].includes(
  String(process.env.APG_SUPERVISOR_PROXY_REQUIRE_OWNER ?? '1').toLowerCase(),
);

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
  // V-003: inject supervisor token server-side — never expose it in app.env.js.
  if (supervisorAuthToken) {
    outHeaders['x-apg-process-token'] = supervisorAuthToken;
  } else {
    delete outHeaders['x-apg-process-token'];
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

const compressibleExt = new Set([
  '.html',
  '.js',
  '.mjs',
  '.css',
  '.json',
  '.svg',
  '.txt',
]);

function staticCacheControlForPath(reqPath, ext) {
  if (reqPath === '/index.html' || reqPath === '/') {
    return 'no-cache, must-revalidate';
  }
  if (
    reqPath.startsWith('/src/runtime/')
    || reqPath.startsWith('/src/features/passwordReset/')
    || reqPath.startsWith('/src/components/passwordReset/')
  ) {
    return 'no-cache, must-revalidate';
  }
  if (reqPath === '/app.bundle.js' || reqPath.startsWith('/modules/')) {
    return 'public, max-age=31536000, immutable';
  }
  if (reqPath.startsWith('/dist-legacy/')) {
    return 'public, max-age=31536000, immutable';
  }
  if (reqPath.startsWith('/vendor/')) {
    return 'public, max-age=31536000, immutable';
  }
  if (ext === '.html') {
    return 'no-cache, must-revalidate';
  }
  return 'public, max-age=86400, stale-while-revalidate=604800';
}

function streamFile(req, res, filePath, reqPath) {
  const ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);
  const contentType = mimeByExt[ext] || 'application/octet-stream';
  const headers = {
    'Content-Type': contentType,
    'Cache-Control': staticCacheControlForPath(reqPath, ext),
    'Last-Modified': stat.mtime.toUTCString(),
    ETag: `W/"${stat.size}-${Math.trunc(stat.mtimeMs)}"`,
    Vary: 'Accept-Encoding',
    ...(securityHeadersEnabled
      ? securityHeaders({
          contentType,
          cspReportOnly,
          csp: ext !== '.js',
        })
      : {}),
  };

  const inm = req.headers['if-none-match'];
  const ims = req.headers['if-modified-since'];
  if ((typeof inm === 'string' && inm === headers.ETag) || (typeof ims === 'string' && ims === headers['Last-Modified'])) {
    res.writeHead(304, headers);
    res.end();
    return;
  }

  let stream = fs.createReadStream(filePath);
  const ae = String(req.headers['accept-encoding'] || '');
  if (compressibleExt.has(ext) && ae.includes('br')) {
    headers['Content-Encoding'] = 'br';
    stream = stream.pipe(zlib.createBrotliCompress());
  } else if (compressibleExt.has(ext) && ae.includes('gzip')) {
    headers['Content-Encoding'] = 'gzip';
    stream = stream.pipe(zlib.createGzip({ level: zlib.constants.Z_BEST_SPEED }));
  }

  res.writeHead(200, headers);
  stream.pipe(res);
}

function safeResolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]).replace(/^\/+/, '');
  const rel = clean === '' ? 'index.html' : clean;
  if (useLegacyProdBundle && (rel === 'index.html' || rel === '')) {
    if (fs.existsSync(legacyProdIndex)) {
      return legacyProdIndex;
    }
  }
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
    res.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8',
      ...(securityHeadersEnabled ? securityHeaders({ csp: false }) : {}),
    });
    res.end('v2 build not found — run: npm run build:v2');
    return;
  }
  streamFile(req, res, filePath, u.pathname);
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
      V2_VISITORS_ENABLED: ['1', 'true', 'yes'].includes(
        String(process.env.V2_VISITORS_ENABLED || '').toLowerCase(),
      ),
      V2_BASE_PATH: '/v2/',
      MEMBER_PHOTO_STORAGE_ENABLED: ['1', 'true', 'yes'].includes(
        String(process.env.MEMBER_PHOTO_STORAGE_ENABLED || '').toLowerCase(),
      ),
      AUTH_SESSION_TTL_MS: authSessionTiming.ttlMs,
      AUTH_SESSION_IDLE_MS: authSessionTiming.idleMs,
      JWT_EXPIRES_IN: authSessionTiming.jwtExpiresIn,
      AUTH_COOKIE_MODE: authCookieMode,
    };
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, must-revalidate',
      ...(securityHeadersEnabled ? securityHeaders({ csp: false }) : {}),
    });
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
    const u = new URL(req.url || '/', `http://${frontendHost}:${frontendPort}`);
    const needsOwnerGate = supervisorProxyRequireOwner && isSupervisorMutationPath(u.pathname);
    if (needsOwnerGate) {
      verifySupervisorProxyOwner(req, { backendHost, backendPort }).then((ok) => {
        if (!ok) {
          if (!res.headersSent) {
            res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              error: 'supervisor-proxy-forbidden',
              message: 'Master owner login required for backend process control.',
            }));
          }
          return;
        }
        proxyToSupervisor(req, res);
      });
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

  if (reqPath === '/dist-legacy/index.html' || reqPath === '/dist-legacy/' || reqPath === '/dist-legacy') {
    res.writeHead(301, { Location: '/index.html' });
    res.end();
    return;
  }

  const abs = safeResolveFile(reqPath);
  if (!abs || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    res.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8',
      ...(securityHeadersEnabled ? securityHeaders({ csp: false }) : {}),
    });
    res.end('Not found');
    return;
  }

  streamFile(req, res, abs, reqPath);
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
