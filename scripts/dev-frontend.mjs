import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function parseEnvFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

parseEnvFile(path.join(rootDir, '.env'));

const frontendPort = Number(process.env.FRONTEND_PORT || 5500);
const frontendHost = process.env.FRONTEND_HOST || '127.0.0.1';
const backendPort = Number(process.env.BACKEND_PORT || process.env.PORT || 4000);
const apiBaseUrl = process.env.API_BASE_URL || `http://localhost:${backendPort}/api`;

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

const server = http.createServer((req, res) => {
  const reqPath = req.url || '/';

  if (reqPath === '/app.env.js') {
    const payload = {
      FRONTEND_PORT: frontendPort,
      BACKEND_PORT: backendPort,
      API_BASE_URL: apiBaseUrl,
    };
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    res.end(`window.__APG_ENV__ = ${JSON.stringify(payload)};`);
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

server.listen(frontendPort, frontendHost, () => {
  // eslint-disable-next-line no-console
  console.log(`Frontend running at http://${frontendHost}:${frontendPort}/index.html`);
  // eslint-disable-next-line no-console
  console.log(`Frontend API base URL: ${apiBaseUrl}`);
});
