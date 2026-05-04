import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function run(name, command, args, cwd) {
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
  });

  return child;
}

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const backend = run('backend', npmCmd, ['run', 'dev'], path.join(rootDir, 'backend'));
const frontend = run('frontend', npmCmd, ['run', 'dev:web'], rootDir);

function shutdown() {
  backend.kill('SIGTERM');
  frontend.kill('SIGTERM');
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
