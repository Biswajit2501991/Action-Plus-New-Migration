import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFromFile, resolveEnvFilePath } from './load-env-file.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');

const CAFF_TRUTHY = new Set(['1', 'y', 'yes', 'true']);

/** Same semantics as scripts/run-autostart.sh: read APG_CAFFEINATE from .env only if unset in the environment. */
function loadApgCaffeinateFromDotenv() {
  if ('APG_CAFFEINATE' in process.env) return;
  const envPath = resolveEnvFilePath(rootDir);
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  let found;
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*APG_CAFFEINATE\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[1].trim();
    const hash = v.indexOf('#');
    if (hash !== -1) v = v.slice(0, hash).trim();
    v = v.replace(/^["']|["']$/g, '');
    found = v;
  }
  if (found !== undefined) process.env.APG_CAFFEINATE = found;
}

function isApgCaffeinateEnabled() {
  const raw = process.env.APG_CAFFEINATE;
  if (raw == null || raw === '') return false;
  const v = String(raw).trim().toLowerCase();
  return CAFF_TRUTHY.has(v);
}

function run(command, args, cwd, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: 'pipe',
      shell: process.platform === 'win32',
    });
    child.stdout.on('data', (chunk) => process.stdout.write(`[${label}] ${chunk}`));
    child.stderr.on('data', (chunk) => process.stderr.write(`[${label}] ${chunk}`));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed with code ${code}`));
    });
  });
}

function start(command, args, cwd, label) {
  const child = spawn(command, args, {
    cwd,
    env: process.env,
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
  child.stdout.on('data', (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  return child;
}

async function ensureDeps() {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const rootModules = path.join(rootDir, 'node_modules');
  const backendModules = path.join(backendDir, 'node_modules');

  if (!fs.existsSync(rootModules)) {
    await run(npmCmd, ['install'], rootDir, 'install-root');
  }
  if (!fs.existsSync(backendModules)) {
    await run(npmCmd, ['install'], backendDir, 'install-backend');
  }
}

async function ensureDatabase() {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  fs.mkdirSync(path.join(backendDir, 'data'), { recursive: true });
  await run(npmCmd, ['run', 'db:migrate'], backendDir, 'db-migrate');
  await run(npmCmd, ['run', 'db:seed'], backendDir, 'db-seed');
}

function openBrowser(url) {
  if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

async function main() {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  loadEnvFromFile(rootDir);
  console.log('[bootstrap] Checking and installing dependencies...');
  await ensureDeps();
  console.log('[bootstrap] Preparing local SQLite database...');
  await ensureDatabase();
  loadApgCaffeinateFromDotenv();
  const caffWanted = isApgCaffeinateEnabled();
  const stackScript = path.join(rootDir, 'scripts', 'dev-all-with-tunnel.mjs');
  const caffeinateBin = '/usr/bin/caffeinate';
  const canCaffeinate =
    process.platform === 'darwin' && caffWanted && fs.existsSync(caffeinateBin);

  if (process.platform === 'darwin' && caffWanted && !fs.existsSync(caffeinateBin)) {
    console.warn(
      '[bootstrap] APG_CAFFEINATE enabled but caffeinate not found; starting without it.',
    );
  }

  console.log('[bootstrap] Starting app, API, and Cloudflare tunnel (same as npm run dev:all:tunnel)...');
  if (canCaffeinate) {
    console.log(
      '[bootstrap] APG_CAFFEINATE: wrapping stack with caffeinate -dims (idle/display/disk sleep deferred).',
    );
  }

  const stack = canCaffeinate
    ? start('caffeinate', ['-dims', '--', process.execPath, stackScript], rootDir, 'stack')
    : start('node', [stackScript], rootDir, 'stack');

  setTimeout(() => {
    openBrowser('http://127.0.0.1:5500/index.html');
  }, 2500);

  const shutdown = () => {
    stack.kill('SIGTERM');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[bootstrap] Failed:', error.message);
  process.exit(1);
});
