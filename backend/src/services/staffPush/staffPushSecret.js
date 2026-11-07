import crypto from 'node:crypto';

/** Same secret the website uses for member push. Not a staff login. */
export function cronSecretMatches(req) {
  const secret = String(process.env.MEMBER_PORTAL_CRON_SECRET || '').trim();
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!secret || secret.length < 16 || !token || token.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(token));
}
