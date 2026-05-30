// @vitest-environment node
//
// Regression: visitor bulk sync must mirror member guards so branch-switch cache
// clears and partial hydrates never push an empty list to the server.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

let html = '';

function extractVisitorsBulkEffect(source) {
  const marker = 'Never push an empty visitor list to the server';
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const effectStart = source.lastIndexOf('React.useEffect(() => {', start);
  const effectEnd = source.indexOf('}, [visitors,', start);
  if (effectStart < 0 || effectEnd < 0) return '';
  return source.slice(effectStart, effectEnd);
}

beforeAll(() => {
  html = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
});

describe('visitor bulk sync guards (index.html)', () => {
  it('blocks empty visitor bulk push to backend', () => {
    const block = extractVisitorsBulkEffect(html);
    expect(block, 'visitor bulk effect must exist').not.toBe('');
    expect(block).toMatch(/Never push an empty visitor list to the server/);
    expect(block).toMatch(/if \(!Array\.isArray\(visitors\) \|\| visitors\.length === 0\) return;/);
  });

  it('honors skipBulkPushAfterHydrate like members', () => {
    const block = extractVisitorsBulkEffect(html);
    expect(block).toMatch(/if \(skipBulkPushAfterHydrate\(\)\) return;/);
  });

  it('waits for backendHydrated before backend bulk sync', () => {
    const block = extractVisitorsBulkEffect(html);
    expect(block).toMatch(/if \(dataSyncMode === 'backend' && !backendHydrated\) return;/);
  });

  it('suppresses bulk sync while branch switch is in flight', () => {
    const block = extractVisitorsBulkEffect(html);
    expect(block).toMatch(/if \(branchSwitching\) return;/);
    expect(block).toMatch(/branchSwitching/);
  });

  it('scopes offline queue flush away from empty visitor payloads', () => {
    expect(html).toMatch(/row\.entity === 'visitors'[\s\S]*?queuedVisitors\.length === 0/);
  });
});
