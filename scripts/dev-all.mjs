import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let shuttingDown = false;
let frontendRestartTimer = null;
let frontendBackoffMs = 2000;
const FRONTEND_RESTART_MAX_MS = 30000;

function run(name, command, args, cwd, { onExit } = {}) {
  const child = spawn(command, args, {
    cwd,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
    shell: process.platform === 'win32',
  });

  const prefix = `[${name}]`;
  child.stdout.on('data', (chunk) => process.stdout.write(`${prefix} ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`${prefix} ${chunk}`));
  child.on('exit', (code, signal) => {
    const suffix = signal ? `signal ${signal}` : `code ${code}`;
    process.stdout.write(`${prefix} exited with ${suffix}\n`);
    onExit?.(code, signal);
  });

  return child;
}

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

let supervisor = run('supervisor', 'node', [path.join(rootDir, 'scripts', 'apg-supervisor.mjs')], rootDir);
let frontend = null;

function startFrontend() {
  frontend = run('frontend', npmCmd, ['run', 'dev:web'], rootDir, {
    onExit: (code, signal) => {
      frontend = null;
      if (shuttingDown) return;
      if (frontendRestartTimer) return;
      const delay = frontendBackoffMs;
      frontendBackoffMs = Math.min(frontendBackoffMs * 2, FRONTEND_RESTART_MAX_MS);
      process.stdout.write(`[dev:all] restarting frontend in ${delay}ms (${signal || code})\n`);
      frontendRestartTimer = setTimeout(() => {
        frontendRestartTimer = null;
        if (!shuttingDown) startFrontend();
      }, delay);
    },
  });
  setTimeout(() => {
    frontendBackoffMs = 2000;
  }, 60000);
}

startFrontend();

function shutdown() {
  shuttingDown = true;
  if (frontendRestartTimer) {
    clearTimeout(frontendRestartTimer);
    frontendRestartTimer = null;
  }
  supervisor.kill('SIGTERM');
  frontend?.kill('SIGTERM');
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
