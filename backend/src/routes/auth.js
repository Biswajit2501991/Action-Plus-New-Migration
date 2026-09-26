import { Router } from 'express';
import { useSupabase } from '../db/dataStore.js';
import {
  buildStaffTokenContext,
  changeStaffPassword,
  findStaffByIdentifier,
  getStaffAppUser,
  loginStaff,
  requestStaffPasswordReset,
  resolveAuthBranchProfile,
  signStaffToken,
  verifyStaffToken,
} from '../auth/staffAuth.js';
import {
  clearAccessTokenCookie,
  isAuthCookieModeEnabled,
  setAccessTokenCookie,
  wantsLegacyAuthResponse,
} from '../auth/sessionCookies.js';
import { resolvePasswordResetDecisionAuth } from '../auth/passwordReset/passwordResetAuth.js';
import {
  adminSetStaffPassword,
  rejectStaffPasswordReset,
} from '../auth/passwordReset/passwordResetRequestService.js';
import { readAuthToken } from '../middleware/requireAuth.js';
import {
  approveStaffPinReset,
  isPinSchemaError,
  pinFeatureStatus,
  recoverPinWithPassword,
  recoverPinWithQuestions,
  rejectStaffPinReset,
  requestOwnerPinReset,
  revealStaffPin,
  saveStaffPinSetup,
  setPinFromRecovery,
} from '../auth/staffPin/staffPinService.js';
import {
  clearLoginFailures,
  loginRateLimit,
  passwordResetRateLimit,
  recordFailedLogin,
} from '../middleware/loginRateLimit.js';

function tokenFromReq(req) {
  return readAuthToken(req);
}

function shouldReturnTokenInBody(req) {
  return !isAuthCookieModeEnabled() || wantsLegacyAuthResponse(req);
}

function attachRotatedToken(req, res, token) {
  if (!token) return;
  if (isAuthCookieModeEnabled() && !wantsLegacyAuthResponse(req)) {
    setAccessTokenCookie(res, token);
    return;
  }
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
    const legacyBody = shouldReturnTokenInBody(req);
    if (isAuthCookieModeEnabled() && !legacyBody) {
      setAccessTokenCookie(res, result.token);
      return res.json({ user: result.user });
    }
    if (isAuthCookieModeEnabled() && legacyBody) {
      setAccessTokenCookie(res, result.token);
    }
    return res.json({ token: result.token, user: result.user });
  } catch (error) {
    recordFailedLogin(req);
    console.error('[auth/login]', error?.message || error);
    return res.status(500).json({ error: 'login-failed', message: String(error?.message || error) });
  }
});

router.post('/logout', (req, res) => {
  clearAccessTokenCookie(res);
  return res.json({ ok: true });
});

router.post('/refresh', async (req, res) => {
  if (!useSupabase()) return res.status(503).json({ error: 'auth-requires-supabase' });
  const token = tokenFromReq(req);
  const claims = verifyStaffToken(token);
  if (!claims?.userId) return res.status(401).json({ error: 'unauthorized' });
  try {
    const profile = await resolveAuthBranchProfile(claims.userId, claims);
    if (!profile.user || profile.user.blocked) {
      clearAccessTokenCookie(res);
      return res.status(401).json({ error: 'invalid-token' });
    }
    const nextToken = signStaffToken(claims.userId, profile.row.gym_id, {
      ...(profile.tokenCtx || {}),
      activeBranchId: profile.activeBranchId,
      mustSetPin: Boolean(claims.mustSetPin),
    });
    // Cookie mode: rotate HttpOnly cookie. Bearer mode: return token in JSON body.
    setAccessTokenCookie(res, nextToken);
    const legacyBody = shouldReturnTokenInBody(req);
    return res.json(legacyBody ? { ok: true, token: nextToken } : { ok: true });
  } catch (error) {
    return res.status(500).json({ error: 'refresh-failed', message: String(error?.message || error) });
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
    const profile = await resolveAuthBranchProfile(claims.userId, claims);
    const user = profile.user;
    if (!user) return res.status(401).json({ error: 'invalid-token' });
    if (user.blocked) return res.status(403).json({ error: 'user-blocked' });
    let nextToken;
    if (profile.claimsStale && profile.row) {
      nextToken = signStaffToken(claims.userId, profile.row.gym_id, {
        ...(profile.tokenCtx || {}),
        activeBranchId: profile.activeBranchId,
      });
      attachRotatedToken(req, res, nextToken);
    }
    const legacyBody = shouldReturnTokenInBody(req);
    return res.json({
      userId: user.id,
      gymId: claims.gymId || null,
      gymCodeId: profile.gymCodeId,
      activeBranchId: profile.activeBranchId,
      allowedBranchIds: profile.allowedBranchIds,
      staffRole: user.staffRole || claims.staffRole || 'staff',
      ...(legacyBody && nextToken ? { token: nextToken } : {}),
      user: {
        ...user,
        mustSetPin: Boolean(claims.mustSetPin),
        gymCodeId: profile.gymCodeId,
        activeBranchId: profile.activeBranchId,
        assignedBranchIds: profile.assignedBranchIds,
        allowedBranchIds: profile.allowedBranchIds,
      },
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

router.patch('/active-branch', async (req, res) => {
  if (!useSupabase()) return res.status(503).json({ error: 'auth-requires-supabase' });
  const claims = verifyStaffToken(tokenFromReq(req));
  if (!claims?.userId) return res.status(401).json({ error: 'unauthorized' });
  const branchId = String(req.body?.gymCodeId || req.body?.activeBranchId || '').trim();
  if (!branchId) return res.status(400).json({ error: 'gym-code-id-required' });
  try {
    const profile = await resolveAuthBranchProfile(claims.userId, claims);
    if (!profile.user) return res.status(401).json({ error: 'invalid-token' });
    const allowed = profile.allowedBranchIds || [];
    const isMaster = String(claims.userId || '').trim().toLowerCase() === 'owner'
      || String(profile.user?.staffRole || '').toLowerCase() === 'master_owner';
    if (!isMaster && allowed.length <= 1) {
      return res.status(403).json({
        error: 'branch-switch-unavailable',
        message: 'This account is not assigned to multiple branches.',
      });
    }
    if (!isMaster && !allowed.includes(branchId)) {
      return res.status(403).json({ error: 'branch-scope-forbidden' });
    }
    const tokenCtx = profile.tokenCtx || await buildStaffTokenContext(profile.row);
    const nextCtx = { ...tokenCtx, activeBranchId: branchId, mustSetPin: Boolean(claims.mustSetPin) };
    const token = signStaffToken(claims.userId, profile.row.gym_id, nextCtx);
    attachRotatedToken(req, res, token);
    const legacyBody = shouldReturnTokenInBody(req);
    return res.json({
      ok: true,
      ...(legacyBody ? { token } : {}),
      gymCodeId: branchId,
      activeBranchId: branchId,
      allowedBranchIds: allowed.length ? allowed : tokenCtx.allowedBranchIds,
      assignedBranchIds: profile.assignedBranchIds,
    });
  } catch (error) {
    return res.status(500).json({ error: 'active-branch-failed', message: String(error?.message || error) });
  }
});

router.post('/admin-set-password', async (req, res) => {
  if (!useSupabase()) return res.status(503).json({ error: 'auth-requires-supabase' });
  const auth = await resolvePasswordResetDecisionAuth(req, res);
  if (!auth) return;
  const staffId = (req.body?.staffId || req.body?.id || '').trim();
  const newPassword = req.body?.newPassword || req.body?.password || '';
  if (!staffId || staffId.toLowerCase() === 'owner') {
    return res.status(400).json({ error: 'invalid-staff-id' });
  }
  if (!newPassword || String(newPassword).length < 4) {
    return res.status(400).json({ error: 'password-too-short' });
  }
  try {
    const result = await adminSetStaffPassword(auth, staffId, newPassword);
    return res.json({ ok: true, staffId: result.staffId, status: result.status });
  } catch (error) {
    const msg = String(error?.message || error);
    const status = error.status || (msg.includes('staff-not-found') ? 404 : 400);
    return res.status(status).json({ error: 'set-password-failed', message: msg });
  }
});

function pinRouteError(res, error) {
  if (isPinSchemaError(error)) {
    return res.status(503).json({
      error: 'pin-storage-not-ready',
      message: 'Staff PIN storage is not ready yet. Run the staff login PIN migration, then try again.',
    });
  }
  const msg = String(error?.message || error);
  const status = error.status || (msg.includes('staff-not-found') ? 404 : 400);
  return res.status(status).json({ error: msg, message: msg });
}

router.get('/pin-status', async (req, res) => {
  if (!useSupabase()) return res.status(503).json({ error: 'auth-requires-supabase' });
  const claims = verifyStaffToken(tokenFromReq(req));
  if (!claims?.userId) return res.status(401).json({ error: 'unauthorized' });
  try {
    const status = await pinFeatureStatus(claims.userId);
    return res.json({ ...status, mustSetPin: Boolean(claims.mustSetPin) });
  } catch (error) {
    return pinRouteError(res, error);
  }
});

router.post('/pin-setup', async (req, res) => {
  if (!useSupabase()) return res.status(503).json({ error: 'auth-requires-supabase' });
  const claims = verifyStaffToken(tokenFromReq(req));
  if (!claims?.userId) return res.status(401).json({ error: 'unauthorized' });
  try {
    const result = await saveStaffPinSetup(claims.userId, req.body || {});
    const legacyBody = shouldReturnTokenInBody(req);
    if (result.token) setAccessTokenCookie(res, result.token);
    return res.json({
      ok: true,
      ...(legacyBody && result.token ? { token: result.token } : {}),
      user: result.user,
    });
  } catch (error) {
    return pinRouteError(res, error);
  }
});

router.post('/pin-recover/password', passwordResetRateLimit, async (req, res) => {
  if (!useSupabase()) return res.status(503).json({ error: 'auth-requires-supabase' });
  const identifier = (req.body?.identifier || req.body?.id || '').trim();
  if (!identifier) return res.status(400).json({ error: 'identifier-required', message: 'Username is required.' });
  try {
    return res.json(await recoverPinWithPassword(identifier, req.body?.password || ''));
  } catch (error) {
    return pinRouteError(res, error);
  }
});

router.post('/pin-recover/questions', passwordResetRateLimit, async (req, res) => {
  if (!useSupabase()) return res.status(503).json({ error: 'auth-requires-supabase' });
  const identifier = (req.body?.identifier || req.body?.id || '').trim();
  if (!identifier) return res.status(400).json({ error: 'identifier-required', message: 'Username is required.' });
  try {
    return res.json(await recoverPinWithQuestions(identifier, req.body?.answers || {}));
  } catch (error) {
    return pinRouteError(res, error);
  }
});

router.post('/pin-recover/request', passwordResetRateLimit, async (req, res) => {
  if (!useSupabase()) return res.status(503).json({ error: 'auth-requires-supabase' });
  const identifier = (req.body?.identifier || req.body?.id || '').trim();
  if (!identifier) return res.status(400).json({ error: 'identifier-required', message: 'Username is required.' });
  try {
    return res.json(await requestOwnerPinReset(identifier));
  } catch (error) {
    return pinRouteError(res, error);
  }
});

router.post('/pin-recover/set-pin', passwordResetRateLimit, async (req, res) => {
  if (!useSupabase()) return res.status(503).json({ error: 'auth-requires-supabase' });
  try {
    return res.json(await setPinFromRecovery(req.body?.recoveryToken, req.body?.pin));
  } catch (error) {
    return pinRouteError(res, error);
  }
});

router.post('/reveal-staff-pin', async (req, res) => {
  if (!useSupabase()) return res.status(503).json({ error: 'auth-requires-supabase' });
  const auth = await resolvePasswordResetDecisionAuth(req, res);
  if (!auth) return;
  const staffId = (req.body?.staffId || req.body?.id || '').trim();
  if (!staffId || staffId.toLowerCase() === 'owner') {
    return res.status(400).json({ error: 'invalid-staff-id', message: 'Choose a staff member.' });
  }
  try {
    return res.json(await revealStaffPin(auth, staffId, req.body?.ownerPassword || ''));
  } catch (error) {
    return pinRouteError(res, error);
  }
});

router.post('/approve-pin-reset', async (req, res) => {
  if (!useSupabase()) return res.status(503).json({ error: 'auth-requires-supabase' });
  const auth = await resolvePasswordResetDecisionAuth(req, res);
  if (!auth) return;
  const staffId = (req.body?.staffId || req.body?.id || '').trim();
  if (!staffId || staffId.toLowerCase() === 'owner') {
    return res.status(400).json({ error: 'invalid-staff-id', message: 'Choose a staff member.' });
  }
  try {
    return res.json(await approveStaffPinReset(
      auth,
      staffId,
      req.body?.tempPassword || req.body?.password || '',
      req.body?.ownerPassword || '',
    ));
  } catch (error) {
    return pinRouteError(res, error);
  }
});

router.post('/reject-pin-reset', async (req, res) => {
  if (!useSupabase()) return res.status(503).json({ error: 'auth-requires-supabase' });
  const auth = await resolvePasswordResetDecisionAuth(req, res);
  if (!auth) return;
  const staffId = (req.body?.staffId || req.body?.id || '').trim();
  if (!staffId || staffId.toLowerCase() === 'owner') {
    return res.status(400).json({ error: 'invalid-staff-id', message: 'Choose a staff member.' });
  }
  try {
    return res.json(await rejectStaffPinReset(auth, staffId));
  } catch (error) {
    return pinRouteError(res, error);
  }
});

router.post('/reject-password-reset', async (req, res) => {
  if (!useSupabase()) return res.status(503).json({ error: 'auth-requires-supabase' });
  const auth = await resolvePasswordResetDecisionAuth(req, res);
  if (!auth) return;
  const staffId = (req.body?.staffId || req.body?.id || '').trim();
  if (!staffId || staffId.toLowerCase() === 'owner') {
    return res.status(400).json({ error: 'invalid-staff-id' });
  }
  try {
    const result = await rejectStaffPasswordReset(auth, staffId);
    return res.json({ ok: true, staffId: result.staffId, status: result.status });
  } catch (error) {
    const msg = String(error?.message || error);
    const status = error.status || (msg.includes('staff-not-found') ? 404 : 400);
    return res.status(status).json({ error: 'reject-password-reset-failed', message: msg });
  }
});

export default router;
