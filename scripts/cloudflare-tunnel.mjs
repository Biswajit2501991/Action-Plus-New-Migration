import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadEnvFromFile } from './load-env-file.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

loadEnvFromFile(rootDir);

const frontendHost = process.env.FRONTEND_HOST || '127.0.0.1';
const frontendPort = Number(process.env.FRONTEND_PORT || 5500);
const localUrl = process.env.CF_TUNNEL_URL || `http://${frontendHost}:${frontendPort}`;
const token = process.env.CF_TUNNEL_TOKEN || '';
const configPath = path.join(rootDir, 'cloudflared.config.yml');

const isWin = process.platform === 'win32';
const localBin = path.join(rootDir, 'tools', 'cloudflared', isWin ? 'cloudflared.exe' : 'cloudflared');
const bin = fs.existsSync(localBin) ? localBin : (isWin ? 'cloudflared.exe' : 'cloudflared');

let args;
if (fs.existsSync(configPath)) {
  args = ['tunnel', '--config', configPath, 'run', 'action-plus-gym'];
} else if (token) {
  args = ['tunnel', 'run', '--token', token];
} else {
  args = ['tunnel', '--url', localUrl];
}

if (fs.existsSync(configPath)) {
  console.log(`[cloudflare] Starting named tunnel from config: ${configPath}`);
} else if (token) {
  console.log('[cloudflare] Starting named tunnel from CF_TUNNEL_TOKEN...');
} else {
  console.log('[cloudflare] Starting temporary tunnel URL (no token configured).');
}
console.log(`[cloudflare] Local origin: ${localUrl}`);

const child = spawn(bin, args, {
  cwd: rootDir,
  env: process.env,
  stdio: 'inherit',
  shell: isWin,
});

child.on('error', (err) => {
  console.error('[cloudflare] Failed to start cloudflared:', err.message);
  console.error('[cloudflare] Install first: brew install cloudflared');
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.log(`[cloudflare] tunnel exited by signal ${signal}`);
    process.exit(0);
  }
  process.exit(code ?? 0);
});

process.on('SIGINT', () => child.kill('SIGTERM'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
