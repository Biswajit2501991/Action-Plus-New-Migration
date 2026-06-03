// @vitest-environment node
//
// Regression: audit log bulk sync must never wipe DB rows via empty PUT.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

let html = '';

function extractLogsBulkEffect(source) {
  const marker = "backendJson('/logs/bulk'";
  const idx = source.indexOf(marker);
  if (idx < 0) return '';
  const effectStart = source.lastIndexOf('React.useEffect(() => {', idx);
  const effectEnd = source.indexOf('}, [logs,', idx);
  if (effectStart < 0 || effectEnd < 0) return '';
  return source.slice(effectStart, effectEnd);
}

beforeAll(() => {
  html = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
});

describe('logs bulk sync guards (index.html)', () => {
  it('blocks empty logs bulk push to backend', () => {
    const block = extractLogsBulkEffect(html);
    expect(block, 'logs bulk effect must exist').not.toBe('');
    expect(block).toMatch(/if \(!Array\.isArray\(logs\) \|\| logs\.length === 0\) return;/);
  });

  it('offline queue flush skips empty log payloads', () => {
    expect(html).toMatch(/row\.entity === 'logs'[\s\S]*?queuedLogs\.length === 0/);
  });
});
