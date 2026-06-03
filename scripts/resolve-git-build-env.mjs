import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Inject build metadata into child process env (supervisor / prod stack).
 * @returns {{ APG_BUILD_SHA?: string, APG_BUILD_AT: string }}
 */
export function resolveGitBuildEnv(cwd = rootDir) {
  const out = { APG_BUILD_AT: new Date().toISOString() };
  if (process.env.APG_BUILD_SHA) {
    out.APG_BUILD_SHA = String(process.env.APG_BUILD_SHA).trim();
    return out;
  }
  try {
    out.APG_BUILD_SHA = execSync('git rev-parse --short HEAD', { cwd, encoding: 'utf8' }).trim();
  } catch {
    // not a git checkout
  }
  return out;
}
