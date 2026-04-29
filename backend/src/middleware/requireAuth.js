/**
 * First-pass auth middleware.
 * Replace decodeToken() with proper JWT verification in production.
 */
export function decodeToken(rawToken) {
  // TODO: integrate jose/jsonwebtoken and verify signature, exp, nbf, aud.
  if (!rawToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(rawToken.split('.')[1] || '', 'base64url').toString('utf8'));
    return payload;
  } catch {
    return null;
  }
}

export function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const claims = decodeToken(token);
  if (!claims) return res.status(401).json({ error: 'unauthorized' });
  if (!claims.tenantId || !claims.userId) return res.status(401).json({ error: 'invalid-token' });

  req.auth = {
    token,
    tenantId: claims.tenantId,
    userId: claims.userId,
    roles: claims.roles || [],
    permissions: claims.permissions || [],
  };
  return next();
}
