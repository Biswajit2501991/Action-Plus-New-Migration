/**
 * Attendance QR kiosk orchestration — challenge, device auth, QR/PIN punch.
 */

import { env } from '../../config/env.js';
import { gymId as resolveGymId, getSupabase } from '../../db/supabase/client.js';
import { useSupabase } from '../../db/dataStore.js';
import { punchStaffAttendance } from '../../db/dataStore.js';
import { T } from '../../db/tables.js';
import { loginStaff, getStaffAppUser } from '../../auth/staffAuth.js';
import { authIsMasterOwner } from '../../auth/tenant/scopedAuth.js';
import { resolveGymCodeId } from '../gymCodesService.js';
import {
  attendanceKioskSecret,
  getCurrentChallenge,
  parseQrPayload,
  validateChallengeCode,
  ATTENDANCE_QR_GRACE_MS,
  ATTENDANCE_QR_ROTATION_MS,
} from './attendanceChallenge.js';
import { kioskDeviceStore } from './kioskDeviceStore.js';
import { listRecentKioskPunches, recordKioskPunch } from './kioskPunchFeed.js';

function secretKey() {
  return attendanceKioskSecret(env.JWT_SECRET || env.ATTENDANCE_KIOSK_SECRET || 'change-me');
}

async function loadBranchMeta(branchId) {
  if (!useSupabase()) return { id: branchId, code: '', name: '' };
  const sb = getSupabase();
  const gid = resolveGymId();
  const { data, error } = await sb
    .from(T.gym_codes)
    .select('id, code, name')
    .eq('gym_id', gid)
    .eq('id', branchId)
    .maybeSingle();
  if (error) throw error;
  return data || { id: branchId, code: '', name: '' };
}

export async function resolveAttendanceBranchId(codeOrId) {
  if (!useSupabase()) {
    const raw = String(codeOrId || '').trim();
    return raw || null;
  }
  return resolveGymCodeId(codeOrId);
}

function staffMayPunchBranch(authOrUser, branchId) {
  if (!authOrUser) return false;
  if (authIsMasterOwner(authOrUser) || String(authOrUser.userId || authOrUser.id || '').toLowerCase() === 'owner') {
    return true;
  }
  const roles = authOrUser.roles || [];
  if (Array.isArray(roles) && roles.includes('owner')) return true;
  const staffRole = String(authOrUser.staffRole || '').toLowerCase();
  if (staffRole === 'master_owner' || staffRole === 'branch_owner') {
    const allowed = authOrUser.allowedBranchIds || authOrUser.assignedBranchIds || [];
    if (Array.isArray(allowed) && allowed.map(String).includes(String(branchId))) return true;
  }
  const home = String(
    authOrUser.activeBranchId
      || authOrUser.gymCodeId
      || authOrUser.gym_code_id
      || '',
  ).trim();
  return Boolean(home && home === String(branchId));
}

export async function buildPublicChallenge({ gymCode, deviceToken, nowMs = Date.now() }) {
  if (!useSupabase()) {
    const err = new Error('kiosk-requires-supabase');
    err.status = 503;
    throw err;
  }
  const branchId = await resolveAttendanceBranchId(gymCode);
  if (!branchId) {
    const err = new Error('branch-not-found');
    err.status = 404;
    throw err;
  }
  const verified = kioskDeviceStore.verifyDeviceToken(deviceToken, {
    gymId: resolveGymId(),
    branchId,
  });
  if (!verified.ok) {
    const err = new Error(verified.reason || 'invalid-device-token');
    err.status = 401;
    throw err;
  }
  const meta = await loadBranchMeta(branchId);
  const challenge = getCurrentChallenge({
    secret: secretKey(),
    gymId: resolveGymId(),
    branchId,
    branchCode: meta.code || gymCode,
    nowMs,
  });
  return {
    ...challenge,
    branchName: meta.name || '',
    deviceLabel: verified.device.label,
    recentPunches: listRecentKioskPunches(branchId),
    methods: ['qr', 'pin', 'login'],
    rotationMs: ATTENDANCE_QR_ROTATION_MS,
    graceMs: ATTENDANCE_QR_GRACE_MS,
  };
}

export function listKioskDevices(branchId) {
  return kioskDeviceStore.listDevices({
    gymId: useSupabase() ? resolveGymId() : undefined,
    branchId: branchId || undefined,
  });
}

export function createKioskDevice({ branchId, label }) {
  if (!useSupabase()) {
    const err = new Error('kiosk-requires-supabase');
    err.status = 503;
    throw err;
  }
  const bid = String(branchId || '').trim();
  if (!bid) {
    const err = new Error('branch-required');
    err.status = 400;
    throw err;
  }
  return kioskDeviceStore.createDevice({
    gymId: resolveGymId(),
    branchId: bid,
    label,
  });
}

export function revokeKioskDevice(deviceId) {
  return kioskDeviceStore.revokeDevice(deviceId);
}

async function applyPunch({ userId, punchType, atIso, timeZone, actorName, branchId, method }) {
  const record = await punchStaffAttendance(null, {
    userId,
    punchType,
    atIso: atIso || new Date().toISOString(),
    timeZone: timeZone || null,
    actorName: actorName || userId,
  });
  recordKioskPunch(branchId, {
    at: atIso || new Date().toISOString(),
    userId,
    staffName: actorName || userId,
    punchType,
    method,
  });
  return record;
}

function resolveCodeAndBranch({ qrPayload, code, branchId, branchKey }) {
  let parsed = null;
  if (qrPayload) parsed = parseQrPayload(qrPayload);
  const resolvedCode = String(code || parsed?.code || '').trim();
  const resolvedBranchKey = String(branchId || branchKey || parsed?.branchKey || '').trim();
  return { resolvedCode, resolvedBranchKey, parsed };
}

export async function punchViaQrScan({
  auth,
  qrPayload,
  code,
  branchId,
  type = 'login',
  atIso,
  timeZone,
  nowMs = Date.now(),
}) {
  const punchType = String(type || 'login').toLowerCase() === 'logout' ? 'logout' : 'login';
  const { resolvedCode, resolvedBranchKey } = resolveCodeAndBranch({ qrPayload, code, branchId });
  if (!resolvedCode) {
    const err = new Error('code-required');
    err.status = 400;
    throw err;
  }
  const bid = await resolveAttendanceBranchId(resolvedBranchKey || branchId);
  if (!bid) {
    const err = new Error('branch-not-found');
    err.status = 404;
    throw err;
  }
  if (!staffMayPunchBranch(auth, bid)) {
    const err = new Error('branch-forbidden');
    err.status = 403;
    throw err;
  }
  const check = validateChallengeCode({
    secret: secretKey(),
    gymId: resolveGymId(),
    branchId: bid,
    code: resolvedCode,
    nowMs,
  });
  if (!check.ok) {
    const err = new Error(check.reason || 'invalid-code');
    err.status = 400;
    throw err;
  }
  const userId = auth.userId || auth.id;
  const user = await getStaffAppUser(userId).catch(() => null);
  const actorName = user?.name || userId;
  const record = await applyPunch({
    userId,
    punchType,
    atIso,
    timeZone,
    actorName,
    branchId: bid,
    method: 'qr',
  });
  return {
    ok: true,
    record,
    punchType,
    method: 'qr',
    graceUsed: check.graceUsed,
    staffName: actorName,
    sound: true,
    toast: punchType === 'logout' ? `Checked out: ${actorName}` : `Checked in: ${actorName}`,
  };
}

/**
 * PIN fallback — staff id + password (+ optional live QR code for branch binding).
 */
export async function punchViaPin({
  identifier,
  password,
  qrPayload,
  code,
  branchId,
  type = 'login',
  atIso,
  timeZone,
  nowMs = Date.now(),
}) {
  const punchType = String(type || 'login').toLowerCase() === 'logout' ? 'logout' : 'login';
  const login = await loginStaff(identifier, password);
  if (!login.ok) {
    const err = new Error(login.error || 'invalid-credentials');
    err.status = login.error === 'user-blocked' ? 403 : 401;
    throw err;
  }
  const user = login.user;
  const auth = {
    userId: user.id,
    id: user.id,
    roles: user.id?.toLowerCase() === 'owner' ? ['owner'] : [],
    staffRole: user.staffRole,
    gymCodeId: user.gymCodeId,
    activeBranchId: user.activeBranchId,
    allowedBranchIds: user.allowedBranchIds,
    assignedBranchIds: user.assignedBranchIds,
  };

  const { resolvedCode, resolvedBranchKey } = resolveCodeAndBranch({
    qrPayload,
    code,
    branchId: branchId || user.activeBranchId || user.gymCodeId,
  });

  let bid = await resolveAttendanceBranchId(
    resolvedBranchKey || branchId || user.activeBranchId || user.gymCodeId,
  );
  if (!bid) {
    const err = new Error('branch-not-found');
    err.status = 404;
    throw err;
  }
  if (!staffMayPunchBranch(auth, bid)) {
    const err = new Error('branch-forbidden');
    err.status = 403;
    throw err;
  }

  // If a QR code is provided, validate it (stronger); otherwise PIN-only at home branch.
  if (resolvedCode) {
    const check = validateChallengeCode({
      secret: secretKey(),
      gymId: resolveGymId(),
      branchId: bid,
      code: resolvedCode,
      nowMs,
    });
    if (!check.ok) {
      const err = new Error(check.reason || 'invalid-code');
      err.status = 400;
      throw err;
    }
  }

  const actorName = user.name || user.id;
  const record = await applyPunch({
    userId: user.id,
    punchType,
    atIso,
    timeZone,
    actorName,
    branchId: bid,
    method: resolvedCode ? 'pin+qr' : 'pin',
  });
  return {
    ok: true,
    record,
    punchType,
    method: resolvedCode ? 'pin+qr' : 'pin',
    staffName: actorName,
    token: login.token,
    user,
    sound: true,
    toast: punchType === 'logout' ? `Checked out: ${actorName}` : `Checked in: ${actorName}`,
  };
}
