/**
 * Resolves tenant context from authenticated claims and request host.
 * In production, validate host against tenant_domains table.
 */
export function resolveTenant(req, res, next) {
  const hostHeader = (req.headers['x-forwarded-host'] || req.headers.host || '').toString().toLowerCase();
  const host = hostHeader.split(',')[0].trim();

  if (!req.auth?.tenantId) return res.status(401).json({ error: 'tenant-missing' });

  req.tenant = {
    id: req.auth.tenantId,
    host,
  };
  return next();
}

export function requirePermission(code) {
  return (req, res, next) => {
    const perms = req.auth?.permissions || [];
    if (!perms.includes(code)) return res.status(403).json({ error: 'forbidden', code });
    return next();
  };
}
