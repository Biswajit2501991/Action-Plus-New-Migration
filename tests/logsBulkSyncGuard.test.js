// @vitest-environment node
//
// Regression: audit logs must persist via POST /api/logs, not debounced bulk PUT.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

let html = '';

function extractLogsPersistEffect(source) {
  const marker = "STORAGE_KEYS.logs, logs";
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

describe('logs persistence guards (index.html)', () => {
  it('does not debounce bulk PUT for logs in backend mode', () => {
    const block = extractLogsPersistEffect(html);
    expect(block, 'logs persist effect must exist').not.toBe('');
    expect(block).toMatch(/if \(dataSyncMode !== 'backend'\)/);
    expect(block).toMatch(/POST \/api\/logs/);
    expect(block).not.toMatch(/backendJson\('\/logs\/bulk'/);
  });

  it('logEvent posts to /api/logs in backend mode', () => {
    expect(html).toMatch(/backendJson\('\/logs',\s*\{\s*method:\s*'POST'/);
  });

  it('offline queue flush posts individual logs', () => {
    expect(html).toMatch(/row\.entity === 'logs'[\s\S]*?backendJson\('\/logs',\s*\{\s*method:\s*'POST'/);
  });
});
