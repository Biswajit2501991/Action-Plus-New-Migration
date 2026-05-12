import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
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
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function run(name, command, args, cwd, env) {
  const child = spawn(command, args, {
    cwd,
    stdio: ['inherit', 'pipe', 'pipe'],
    env,
    shell: process.platform === 'win32',
  });

  const prefix = `[${name}]`;
  child.stdout.on('data', (chunk) => process.stdout.write(`${prefix} ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`${prefix} ${chunk}`));
  child.on('exit', (code, signal) => {
    const suffix = signal ? `signal ${signal}` : `code ${code}`;
    process.stdout.write(`${prefix} exited with ${suffix}\n`);
  });

  return child;
}

const localEnvPath = path.join(rootDir, '.env.local');
const localOverrides = parseEnvFile(localEnvPath);

const isolatedEnv = {
  ...process.env,
  ...localOverrides,
  FRONTEND_HOST: '127.0.0.1',
  FRONTEND_PORT: '5501',
  BACKEND_PORT: '4001',
  PORT: '4001',
  APG_SUPERVISOR_PORT: '4011',
  API_BASE_URL: '/api',
  DATABASE_PATH: './data/app.local.db',
};

if (!fs.existsSync(localEnvPath)) {
  process.stdout.write(
    '[isolated] .env.local not found, using safe defaults (frontend 5501, backend 4001, supervisor 4011).\n',
  );
}

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const supervisor = run(
  'supervisor:isolated',
  'node',
  [path.join(rootDir, 'scripts', 'apg-supervisor.mjs')],
  rootDir,
  isolatedEnv,
);
const frontend = run(
  'frontend:isolated',
  npmCmd,
  ['run', 'dev:web'],
  rootDir,
  isolatedEnv,
);

function shutdown() {
  supervisor.kill('SIGTERM');
  frontend.kill('SIGTERM');
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
