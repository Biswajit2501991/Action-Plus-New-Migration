import { Router } from 'express';
import { useSupabase } from '../db/dataStore.js';
import {
  changeStaffPassword,
  getStaffAppUser,
  loginStaff,
  requireOwnerAuth,
  requestStaffPasswordReset,
  setStaffPassword,
  verifyStaffToken,
} from '../auth/staffAuth.js';
import { readBearerToken } from '../middleware/requireAuth.js';
import {
  clearLoginFailures,
  loginRateLimit,
  passwordResetRateLimit,
  recordFailedLogin,
} from '../middleware/loginRateLimit.js';

function tokenFromReq(req) {
  return readBearerToken(req);
}

const router = Router();

router.post('/login', loginRateLimit, async (req, res) => {
  if (!useSupabase()) {
    return res.status(503).json({ error: 'auth-requires-supabase' });
  }
  const identifier = (req.body?.identifier || req.body?.id || '').trim();
  const password = req.body?.password || '';
  if (!identifier || !password) {
    return res.status(400).json({ error: 'identifier-password-required' });
  }
  try {
    const result = await loginStaff(identifier, password);
    if (!result.ok) {
      recordFailedLogin(req);
      const code = result.error === 'user-blocked' ? 403 : 401;
      return res.status(code).json({ error: result.error });
    }
    clearLoginFailures(req);
    return res.json({ token: result.token, user: result.user });
  } catch (error) {
    recordFailedLogin(req);
    return res.status(500).json({ error: 'login-failed', message: String(error?.message || error) });
  }
});

router.post('/request-password-reset', passwordResetRateLimit, async (req, res) => {
  if (!useSupabase()) return res.status(503).json({ error: 'auth-requires-supabase' });
  const identifier = (req.body?.identifier || req.body?.id || '').trim();
  if (!identifier) return res.status(400).json({ error: 'identifier-required' });
  try {
    await requestStaffPasswordReset(identifier);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: 'request-failed', message: String(error?.message || error) });
  }
});

router.get('/me', async (req, res) => {
  if (!useSupabase()) return res.status(503).json({ error: 'auth-requires-supabase' });
  const claims = verifyStaffToken(tokenFromReq(req));
  if (!claims?.userId) return res.status(401).json({ error: 'unauthorized' });
  try {
    const user = await getStaffAppUser(claims.userId);
    if (!user) return res.status(401).json({ error: 'invalid-token' });
    if (user.blocked) return res.status(403).json({ error: 'user-blocked' });
    return res.json({
      userId: user.id,
      gymId: claims.gymId || null,
      user,
      roles: claims.roles || [],
      permissions: claims.permissions || [],
    });
  } catch (error) {
    return res.status(500).json({ error: 'me-failed', message: String(error?.message || error) });
  }
});

router.post('/change-password', async (req, res) => {
  if (!useSupabase()) return res.status(503).json({ error: 'auth-requires-supabase' });
  const claims = verifyStaffToken(tokenFromReq(req));
  if (!claims?.userId) return res.status(401).json({ error: 'unauthorized' });
  const currentPassword = req.body?.currentPassword || '';
  const newPassword = req.body?.newPassword || '';
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'passwords-required' });
  }
  try {
    const result = await changeStaffPassword(claims.userId, currentPassword, newPassword);
    if (!result.ok) return res.status(401).json({ error: result.error });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: 'change-password-failed', message: String(error?.message || error) });
  }
});

router.post('/admin-set-password', async (req, res) => {
  if (!useSupabase()) return res.status(503).json({ error: 'auth-requires-supabase' });
  if (!requireOwnerAuth(req, res)) return;
  const staffId = (req.body?.staffId || req.body?.id || '').trim();
  const newPassword = req.body?.newPassword || req.body?.password || '';
  if (!staffId || staffId.toLowerCase() === 'owner') {
    return res.status(400).json({ error: 'invalid-staff-id' });
  }
  if (!newPassword || String(newPassword).length < 4) {
    return res.status(400).json({ error: 'password-too-short' });
  }
  try {
    await setStaffPassword(staffId, newPassword, { clearPasswordReset: true });
    return res.json({ ok: true, staffId });
  } catch (error) {
    return res.status(400).json({ error: 'set-password-failed', message: String(error?.message || error) });
  }
});

export default router;
