// @vitest-environment node
//
// Phase 4 security audit. Ensures the audit-log sanitizer (sanitizeForLog in
// index.html) never persists JWTs, raw bearer tokens, env-style secrets, or
// PII like raw passwords. We exercise the function in pure JS by extracting
// its definition from index.html and re-evaluating it in a sandboxed VM,
// because the monolithic index.html is not a module and cannot be imported.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * Extract the sanitizer logic from index.html and reconstruct the function in
 * the current process. We rely on stable markers around the function body to
 * avoid drifting if line numbers change.
 */
function loadSanitizer() {
  const html = fs.readFileSync(path.join(REPO_ROOT, 'index.html'), 'utf8');
  const start = html.indexOf('const APG_REDACT_KEYS');
  if (start < 0) throw new Error('Could not locate APG_REDACT_KEYS in index.html');
  const sanitizerEnd = html.indexOf('// Exposed for tests', start);
  if (sanitizerEnd < 0) throw new Error('Could not locate sanitizer end in index.html');
  const body = html.slice(start, sanitizerEnd);
  // Build a CJS-style wrapper so we can return sanitizeForLog without touching
  // browser globals (window, etc.).
  const wrapper = new Function(`
    ${body}
    return { sanitizeForLog, APG_REDACT_KEYS, APG_JWT_RE, APG_BEARER_RE };
  `);
  return wrapper();
}

let sanitizer;

beforeAll(() => {
  sanitizer = loadSanitizer();
});

describe('Phase 4 audit-log sanitizer', () => {
  it('redacts password, newPassword, oldPassword, currentPassword, confirmPassword', () => {
    const out = sanitizer.sanitizeForLog({
      password: 'plain-text-pw',
      newPassword: 'next-pw',
      oldPassword: 'old-pw',
      currentPassword: 'curr-pw',
      confirmPassword: 'confirm-pw',
      keep: 'visible',
    });
    expect(out.password).toBe('[redacted]');
    expect(out.newPassword).toBe('[redacted]');
    expect(out.oldPassword).toBe('[redacted]');
    expect(out.currentPassword).toBe('[redacted]');
    expect(out.confirmPassword).toBe('[redacted]');
    expect(out.keep).toBe('visible');
  });

  it('redacts auth/secret/api key fields', () => {
    const out = sanitizer.sanitizeForLog({
      token: 'aaa',
      authToken: 'bbb',
      accessToken: 'ccc',
      refreshToken: 'ddd',
      apiKey: 'eee',
      api_key: 'fff',
      secret: 'ggg',
      serviceRoleKey: 'hhh',
      service_role_key: 'iii',
      supabaseServiceRoleKey: 'jjj',
      authorization: 'kkk',
      Authorization: 'lll',
      cookie: 'mmm',
      Cookie: 'nnn',
      'set-cookie': 'ooo',
    });
    for (const key of Object.keys(out)) {
      expect(out[key], `${key} must be redacted`).toBe('[redacted]');
    }
  });

  it('replaces JWT-shaped strings anywhere in the tree with [jwt]', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const out = sanitizer.sanitizeForLog({
      message: `User auth: ${jwt}`,
      // `Bearer xxx` should collapse to `[bearer]` (bearer replacement runs
      // first), so the [jwt] token won't appear here — only [bearer].
      nested: { detail: `Header: Authorization: Bearer ${jwt}` },
      arr: [jwt, 'safe-value', `prefix ${jwt} suffix`],
    });
    expect(out.message).not.toContain(jwt);
    expect(out.message).toContain('[jwt]');
    expect(out.nested.detail).not.toContain(jwt);
    expect(out.nested.detail).toContain('[bearer]');
    expect(out.nested.detail).not.toContain('Bearer eyJ');
    expect(out.arr[0]).not.toContain(jwt);
    expect(out.arr[0]).toContain('[jwt]');
  });

  it('replaces `Bearer xxx` substrings with [bearer]', () => {
    const out = sanitizer.sanitizeForLog({
      header: 'Authorization: Bearer abc.def.ghi',
      body: 'Bearer plain-token-12345',
    });
    expect(out.header).toContain('[bearer]');
    expect(out.header).not.toContain('Bearer abc');
    expect(out.body).toContain('[bearer]');
    expect(out.body).not.toContain('Bearer plain');
  });

  it('clamps long strings to 300 chars + "..."', () => {
    const longString = 'x'.repeat(1000);
    const out = sanitizer.sanitizeForLog({ blob: longString });
    expect(out.blob.length).toBeLessThanOrEqual(303);
    expect(out.blob.endsWith('...')).toBe(true);
  });

  it('redacts photo to [image] when present', () => {
    const out = sanitizer.sanitizeForLog({ photo: 'data:image/png;base64,iVBORw0KGgoAA==' });
    expect(out.photo).toBe('[image]');
  });

  it('returns null on bad input without throwing', () => {
    expect(sanitizer.sanitizeForLog(null)).toBeNull();
    expect(sanitizer.sanitizeForLog(undefined)).toBeNull();
  });

  it('preserves leave-request shape after sanitization', () => {
    const req = {
      id: 'lr-1',
      userId: 'deep',
      type: 'Sick',
      startDate: '2026-05-21',
      endDate: '2026-05-22',
      days: 2,
      reason: 'Family emergency',
      status: 'Pending',
      createdAt: '2026-05-21T10:00:00Z',
      createdBy: 'deep',
    };
    const out = sanitizer.sanitizeForLog(req);
    expect(out).toMatchObject({
      id: 'lr-1',
      userId: 'deep',
      type: 'Sick',
      days: 2,
      reason: 'Family emergency',
      status: 'Pending',
    });
  });

  it('does not silently corrupt a payment-history entry log payload', () => {
    const before = {
      id: 'p-1',
      amount: 1000,
      method: 'cash',
      paidAt: '2026-05-21T10:00:00Z',
      note: 'Monthly fee',
      recordedBy: 'owner',
    };
    const after = { ...before, amount: 1500, editedBy: 'owner', editedAt: '2026-05-21T11:00:00Z' };
    const safeBefore = sanitizer.sanitizeForLog(before);
    const safeAfter = sanitizer.sanitizeForLog(after);
    expect(safeBefore).toEqual(before);
    expect(safeAfter).toEqual(after);
  });
});
