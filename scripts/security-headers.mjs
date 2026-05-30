/**
 * Security response headers (V-002 Phase 2A).
 * Applied by scripts/dev-frontend.mjs for HTML and static assets.
 */

/**
 * CSP tuned for legacy SPA: local vendor scripts, inline tailwind config, inline styles.
 */
export function buildContentSecurityPolicy() {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ].join('; ');
}

/**
 * @param {{ contentType?: string, csp?: boolean, cspReportOnly?: boolean }} [opts]
 * @returns {Record<string, string>}
 */
export function securityHeaders(opts = {}) {
  const out = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  };

  const isHtml = (opts.contentType || '').includes('text/html');
  if (isHtml) {
    out['Cross-Origin-Opener-Policy'] = 'same-origin';
  }

  if (opts.csp !== false) {
    const policy = buildContentSecurityPolicy();
    const header = opts.cspReportOnly
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy';
    out[header] = policy;
  }

  return out;
}

/**
 * @param {import('http').ServerResponse} res
 * @param {{ contentType?: string, csp?: boolean, cspReportOnly?: boolean }} [opts]
 */
export function applySecurityHeaders(res, opts = {}) {
  for (const [key, value] of Object.entries(securityHeaders(opts))) {
    res.setHeader(key, value);
  }
}
