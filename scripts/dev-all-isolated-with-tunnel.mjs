import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function run(name, command, args) {
  const child = spawn(command, args, {
    cwd: rootDir,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
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

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const app = run('app:isolated', npmCmd, ['run', 'dev:all:isolated']);
const tunnel = run('tunnel:isolated', npmCmd, ['run', 'dev:tunnel']);

function shutdown() {
  app.kill('SIGTERM');
  tunnel.kill('SIGTERM');
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
