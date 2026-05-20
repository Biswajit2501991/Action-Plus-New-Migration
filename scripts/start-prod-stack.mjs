/**
 * Production stack for login/autostart: frontend + backend (via supervisor) + Cloudflare tunnel.
 * No browser open, no npm install — use bootstrap-and-run for first-time setup.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFromFile, resolveEnvFilePath } from './load-env-file.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function pickEnvFile() {
  if (process.env.ENV_FILE) return process.env.ENV_FILE;
  const prod = path.join(rootDir, '.env.prod');
  if (fs.existsSync(prod)) return '.env.prod';
  return '.env';
}

const envFile = pickEnvFile();
process.env.ENV_FILE = envFile;
const loaded = loadEnvFromFile(rootDir);
const fePort = Number(process.env.FRONTEND_PORT || 5501);
const bePort = Number(process.env.BACKEND_PORT || process.env.PORT || 4000);

console.log(`[prod-stack] ENV_FILE=${envFile}${loaded ? '' : ' (file missing — using process env)'}`);
console.log(`[prod-stack] Frontend :${fePort} → backend :${bePort} + Cloudflare tunnel`);

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const stackScript = path.join(rootDir, 'scripts', 'dev-all-with-tunnel.mjs');

const child = spawn(process.execPath, [stackScript], {
  cwd: rootDir,
  env: { ...process.env, ENV_FILE: envFile },
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  const suffix = signal ? `signal ${signal}` : `code ${code ?? 0}`;
  process.exit(code ?? (signal ? 1 : 0));
});

function shutdown(sig) {
  child.kill(sig);
}

process.on('SIGINT', () => shutdown('SIGTERM'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
