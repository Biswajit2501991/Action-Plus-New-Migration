import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, securityHeaders } from '../scripts/security-headers.mjs';

describe('security-headers', () => {
  it('builds a CSP without unsafe-eval', () => {
    const csp = buildContentSecurityPolicy();
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('adds baseline hardening headers for HTML', () => {
    const headers = securityHeaders({ contentType: 'text/html; charset=utf-8' });
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Content-Security-Policy']).toBeTruthy();
    expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin');
  });

  it('can emit report-only CSP', () => {
    const headers = securityHeaders({ contentType: 'text/html', cspReportOnly: true });
    expect(headers['Content-Security-Policy-Report-Only']).toBeTruthy();
    expect(headers['Content-Security-Policy']).toBeUndefined();
  });
});
