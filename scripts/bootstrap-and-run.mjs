import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const backendDir = path.join(rootDir, 'backend');

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
  console.log('[bootstrap] Checking and installing dependencies...');
  await ensureDeps();
  console.log('[bootstrap] Preparing local SQLite database...');
  await ensureDatabase();
  console.log('[bootstrap] Starting supervisor (manages API), then frontend...');
  const supervisor = start('node', [path.join(rootDir, 'scripts', 'apg-supervisor.mjs')], rootDir, 'supervisor');
  const frontend = start(npmCmd, ['run', 'dev:web'], rootDir, 'frontend');

  setTimeout(() => {
    openBrowser('http://127.0.0.1:5500/index.html');
  }, 2500);

  const shutdown = () => {
    supervisor.kill('SIGTERM');
    frontend.kill('SIGTERM');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[bootstrap] Failed:', error.message);
  process.exit(1);
});
