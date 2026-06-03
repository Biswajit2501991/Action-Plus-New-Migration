import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function resolvePackageVersion() {
  try {
    const raw = readFileSync(path.join(repoRoot, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw);
    return String(pkg.version || '0.0.0');
  } catch {
    return '0.0.0';
  }
}

function resolveGitSha() {
  const fromEnv = String(process.env.APG_BUILD_SHA || '').trim();
  if (fromEnv) return fromEnv;
  try {
    return execSync('git rev-parse --short HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/** Stable API capability flags for clients and ops checks. */
export const apiFeatures = {
  financeSummary: true,
  financeReconciliation: true,
  memberPaidForMonthLedger: true,
};

export const buildInfo = {
  version: resolvePackageVersion(),
  buildSha: resolveGitSha(),
  buildAt: process.env.APG_BUILD_AT || null,
};

export function versionPayload(extra = {}) {
  return {
    service: 'gym-backend',
    ...buildInfo,
    features: apiFeatures,
    ...extra,
  };
}
