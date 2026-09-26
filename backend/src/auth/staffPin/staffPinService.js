import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { T } from '../../db/tables.js';
import { getSupabase, gymId } from '../../db/supabase/client.js';
import { updateStaffUserRow } from '../../db/supabase/staffUsersWrite.js';
import { hashPassword, verifyPassword } from '../passwords.js';
import {
  findStaffByIdentifier,
  getStaffAppUser,
  resolveAuthBranchProfile,
  signStaffToken,
} from '../staffAuth.js';
import { assertActorCanDecideForStaff } from '../passwordReset/passwordResetDecisionEngine.js';
import { logPasswordResetAudit } from '../passwordReset/passwordResetAuditService.js';
import {
  PIN_HISTORY_KEEP,
  PIN_PASSWORD_ATTEMPTS,
  PIN_TEMP_HOURS,
  STAFF_PIN_QUESTIONS,
  answersPass,
  isStaffPin,
  normalizePinAnswer,
} from './staffPinRules.js';

const QUESTION_KEYS = STAFF_PIN_QUESTIONS.map((q) => q.key);

function httpError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function loginKey(row) {
  return String(row?.staff_login_id || '').trim();
}

function isOwnerLogin(row) {
  return loginKey(row).toLowerCase() === 'owner';
}

export function isPinSchemaError(error) {
  return /pin_hash|pin_plain|pin_recover|pin_reset_|security_ready_at|staff_password_history|staff_security_answers/i
    .test(String(error?.message || error));
}

async function loadAnswers(gym, loginId) {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(T.staff_security_answers)
    .select('question_key, answer_hash')
    .eq('gym_id', gym)
    .eq('staff_login_id', loginId);
  if (error) throw error;
  return data || [];
}

export async function rememberReplacedPassword(row) {
  const hash = String(row?.password_hash || '').trim();
  const loginId = loginKey(row);
  const gym = String(row?.gym_id || gymId() || '').trim();
  if (!hash || !loginId || !gym) return;
  const sb = getSupabase();
  const { error } = await sb.from(T.staff_password_history).insert({
    gym_id: gym,
    staff_login_id: loginId,
    password_hash: hash,
  });
  if (error) throw error;
  const { data: rows, error: listErr } = await sb
    .from(T.staff_password_history)
    .select('id, created_at')
    .eq('gym_id', gym)
    .eq('staff_login_id', loginId)
    .order('created_at', { ascending: false });
  if (listErr) throw listErr;
  const extra = (rows || []).slice(PIN_HISTORY_KEEP).map((r) => r.id).filter(Boolean);
  if (!extra.length) return;
  const { error: delErr } = await sb.from(T.staff_password_history).delete().in('id', extra);
  if (delErr) throw delErr;
}

async function rememberedPasswordMatches(row, plain) {
  if (await verifyPassword(plain, row.password_hash)) return true;
  const gym = String(row.gym_id || gymId() || '').trim();
  const loginId = loginKey(row);
  const sb = getSupabase();
  const { data, error } = await sb
    .from(T.staff_password_history)
    .select('password_hash')
    .eq('gym_id', gym)
    .eq('staff_login_id', loginId)
    .order('created_at', { ascending: false })
    .limit(PIN_HISTORY_KEEP);
  if (error) throw error;
  for (const item of data || []) {
    if (await verifyPassword(plain, item.password_hash)) return true;
  }
  return false;
}

function signRecoveryToken(row) {
  return jwt.sign(
    {
      purpose: 'staff-pin-set',
      staffLoginId: loginKey(row),
      gymId: String(row.gym_id || ''),
    },
    env.JWT_SECRET,
    { expiresIn: '20m' },
  );
}

function readRecoveryToken(token) {
  try {
    const claims = jwt.verify(String(token || ''), env.JWT_SECRET);
    if (claims?.purpose !== 'staff-pin-set' || !claims.staffLoginId) return null;
    return claims;
  } catch {
    return null;
  }
}

async function issueSession(row, { mustSetPin = false } = {}) {
  const loginId = loginKey(row);
  const profile = await resolveAuthBranchProfile(loginId, {});
  const token = signStaffToken(loginId, row.gym_id, {
    ...(profile.tokenCtx || {}),
    activeBranchId: profile.activeBranchId,
    mustSetPin,
  });
  const user = profile.user || await getStaffAppUser(loginId);
  return {
    token,
    user: user ? { ...user, mustSetPin } : null,
  };
}

async function clearRecoverFlags(row, extra = {}) {
  const sb = getSupabase();
  await updateStaffUserRow(sb, row.id, {
    pin_recover_fails: 0,
    pin_recover_questions: false,
    pin_recover_questions_failed: false,
    updated_at: new Date().toISOString(),
    ...extra,
  });
}

export async function pinFeatureStatus(staffLoginId) {
  const row = await findStaffByIdentifier(staffLoginId);
  if (!row) return { enabled: false, hasPin: false, hasSecurityAnswers: false };
  const sb = getSupabase();
  const { error } = await sb.from(T.staff_users).select('pin_hash').eq('id', row.id).limit(1);
  if (error && isPinSchemaError(error)) {
    return { enabled: false, hasPin: false, hasSecurityAnswers: false };
  }
  if (error) throw error;
  return {
    enabled: true,
    hasPin: Boolean(row.pin_hash),
    hasSecurityAnswers: Boolean(row.security_ready_at),
  };
}

export async function saveStaffPinSetup(staffLoginId, body) {
  const row = await findStaffByIdentifier(staffLoginId);
  if (!row) throw httpError('staff-not-found', 404);
  if (row.is_blocked) throw httpError('user-blocked', 403);
  const pin = String(body?.pin || '').trim();
  if (!isStaffPin(pin)) throw httpError('PIN must be 4 to 8 digits.');
  const ready = Boolean(row.security_ready_at);
  const answers = body?.answers && typeof body.answers === 'object' ? body.answers : null;
  if (!ready) {
    await saveSecurityAnswers(row, answers);
  }
  const sb = getSupabase();
  const now = new Date().toISOString();
  await updateStaffUserRow(sb, row.id, {
    pin_hash: await hashPassword(pin),
    pin_plain: pin,
    pin_set_at: now,
    security_ready_at: ready ? row.security_ready_at : now,
    pin_reset_temp_hash: null,
    pin_reset_temp_expires_at: null,
    pin_recover_fails: 0,
    pin_recover_questions: false,
    pin_recover_questions_failed: false,
    updated_at: now,
  });
  await logPasswordResetAudit({
    action: 'staff.pin.set',
    actorId: loginKey(row),
    staffId: loginKey(row),
    staffName: row.full_name || loginKey(row),
    meta: { setAt: now },
  }).catch(() => {});
  return issueSession(row, { mustSetPin: false });
}

async function saveSecurityAnswers(row, answers) {
  if (!answers) throw httpError('Answer all five questions before setting a PIN.');
  const gym = String(row.gym_id || gymId() || '').trim();
  const loginId = loginKey(row);
  const now = new Date().toISOString();
  const rows = [];
  for (const key of QUESTION_KEYS) {
    const normalized = normalizePinAnswer(key, answers[key]);
    if (!normalized) throw httpError('Answer all five questions before setting a PIN.');
    rows.push({
      gym_id: gym,
      staff_login_id: loginId,
      question_key: key,
      answer_hash: await hashPassword(normalized),
      updated_at: now,
    });
  }
  const sb = getSupabase();
  const { error } = await sb.from(T.staff_security_answers).upsert(rows, {
    onConflict: 'gym_id,staff_login_id,question_key',
  });
  if (error) throw error;
}

function genericPasswordStage() {
  return { ok: true, stage: 'password', attemptsLeft: PIN_PASSWORD_ATTEMPTS - 1 };
}

export async function recoverPinWithPassword(identifier, rememberedPassword) {
  const row = await findStaffByIdentifier(identifier);
  if (!row || row.is_blocked || isOwnerLogin(row)) return genericPasswordStage();
  if (row.pin_recover_questions_failed) return { ok: true, stage: 'request-owner' };
  if (row.pin_recover_questions) return { ok: true, stage: 'questions' };
  const plain = String(rememberedPassword || '');
  if (!plain) return { ok: true, stage: 'password', attemptsLeft: PIN_PASSWORD_ATTEMPTS };
  const matched = await rememberedPasswordMatches(row, plain);
  if (matched) {
    await clearRecoverFlags(row);
    return { ok: true, stage: 'set-pin', recoveryToken: signRecoveryToken(row) };
  }
  const fails = Number(row.pin_recover_fails || 0) + 1;
  const sb = getSupabase();
  if (fails >= PIN_PASSWORD_ATTEMPTS) {
    await updateStaffUserRow(sb, row.id, {
      pin_recover_fails: 0,
      pin_recover_questions: true,
      updated_at: new Date().toISOString(),
    });
    return { ok: true, stage: 'questions' };
  }
  await updateStaffUserRow(sb, row.id, {
    pin_recover_fails: fails,
    updated_at: new Date().toISOString(),
  });
  return { ok: true, stage: 'password', attemptsLeft: PIN_PASSWORD_ATTEMPTS - fails };
}

export async function recoverPinWithQuestions(identifier, answers) {
  const row = await findStaffByIdentifier(identifier);
  if (!row || row.is_blocked || isOwnerLogin(row)) return { ok: true, stage: 'request-owner' };
  if (row.pin_recover_questions_failed) return { ok: true, stage: 'request-owner' };
  if (!row.pin_recover_questions) return { ok: true, stage: 'password', attemptsLeft: PIN_PASSWORD_ATTEMPTS };
  if (!row.security_ready_at) {
    await updateStaffUserRow(getSupabase(), row.id, {
      pin_recover_questions_failed: true,
      updated_at: new Date().toISOString(),
    });
    return { ok: true, stage: 'request-owner' };
  }
  const stored = await loadAnswers(String(row.gym_id || gymId() || ''), loginKey(row));
  let correct = 0;
  for (const key of QUESTION_KEYS) {
    const hashed = stored.find((item) => item.question_key === key)?.answer_hash;
    const given = normalizePinAnswer(key, answers?.[key]);
    if (hashed && given && await verifyPassword(given, hashed)) correct += 1;
  }
  if (answersPass(correct)) {
    await clearRecoverFlags(row);
    return { ok: true, stage: 'set-pin', recoveryToken: signRecoveryToken(row) };
  }
  await updateStaffUserRow(getSupabase(), row.id, {
    pin_recover_questions_failed: true,
    updated_at: new Date().toISOString(),
  });
  return { ok: true, stage: 'request-owner' };
}

export async function requestOwnerPinReset(identifier) {
  const row = await findStaffByIdentifier(identifier);
  if (!row || row.is_blocked || isOwnerLogin(row)) return { ok: true };
  if (!row.pin_recover_questions_failed) return { ok: true, stage: 'questions' };
  const now = new Date().toISOString();
  await updateStaffUserRow(getSupabase(), row.id, {
    pin_reset_requested_at: now,
    pin_reset_approved_at: null,
    pin_reset_temp_hash: null,
    pin_reset_temp_expires_at: null,
    updated_at: now,
  });
  await logPasswordResetAudit({
    action: 'staff.pin_reset.requested',
    actorId: loginKey(row),
    staffId: loginKey(row),
    staffName: row.full_name || loginKey(row),
    meta: { requestedAt: now },
  }).catch(() => {});
  return { ok: true };
}

export async function setPinFromRecovery(recoveryToken, pin) {
  const claims = readRecoveryToken(recoveryToken);
  if (!claims) throw httpError('This reset step expired. Start again.', 400);
  const row = await findStaffByIdentifier(claims.staffLoginId);
  if (!row || String(row.gym_id || '') !== String(claims.gymId || row.gym_id || '')) {
    throw httpError('This reset step expired. Start again.', 400);
  }
  const next = String(pin || '').trim();
  if (!isStaffPin(next)) throw httpError('PIN must be 4 to 8 digits.');
  const now = new Date().toISOString();
  await updateStaffUserRow(getSupabase(), row.id, {
    pin_hash: await hashPassword(next),
    pin_plain: next,
    pin_set_at: now,
    pin_reset_temp_hash: null,
    pin_reset_temp_expires_at: null,
    pin_recover_fails: 0,
    pin_recover_questions: false,
    pin_recover_questions_failed: false,
    updated_at: now,
  });
  await logPasswordResetAudit({
    action: 'staff.pin.reset',
    actorId: loginKey(row),
    staffId: loginKey(row),
    staffName: row.full_name || loginKey(row),
    meta: { setAt: now },
  }).catch(() => {});
  return { ok: true };
}

async function assertActorPassword(auth, ownerPassword) {
  const actor = await findStaffByIdentifier(auth?.userId);
  if (!actor) throw httpError('unauthorized', 403);
  const ok = await verifyPassword(String(ownerPassword || ''), actor.password_hash);
  if (!ok) throw httpError('Owner password did not match.', 403);
}

export async function revealStaffPin(auth, staffLoginId, ownerPassword) {
  await assertActorPassword(auth, ownerPassword);
  const target = await getStaffAppUser(staffLoginId);
  if (!target) throw httpError('staff-not-found', 404);
  assertActorCanDecideForStaff(auth, target);
  const row = await findStaffByIdentifier(staffLoginId);
  if (!row) throw httpError('staff-not-found', 404);
  await logPasswordResetAudit({
    action: 'staff.pin.viewed',
    actorId: auth.userId,
    staffId: target.id,
    staffName: target.name || target.id,
    meta: { viewedAt: new Date().toISOString() },
  }).catch(() => {});
  const pin = String(row.pin_plain || '').trim();
  return { pin: pin || null, available: Boolean(pin), staffId: target.id, name: target.name || target.id };
}

export async function approveStaffPinReset(auth, staffLoginId, tempPassword, ownerPassword) {
  await assertActorPassword(auth, ownerPassword);
  const row = await findStaffByIdentifier(staffLoginId);
  if (!row) throw httpError('staff-not-found', 404);
  const target = await getStaffAppUser(staffLoginId);
  if (!target) throw httpError('staff-not-found', 404);
  assertActorCanDecideForStaff(auth, target);
  if (!row.pin_reset_requested_at || (row.pin_reset_approved_at && row.pin_reset_approved_at >= row.pin_reset_requested_at)) {
    throw httpError('No PIN reset is waiting for this staff member.', 409);
  }
  const temp = String(tempPassword || '').trim();
  if (temp.length < 6) throw httpError('Temporary password must be at least 6 characters.');
  const now = new Date();
  const expires = new Date(now.getTime() + PIN_TEMP_HOURS * 60 * 60 * 1000).toISOString();
  await updateStaffUserRow(getSupabase(), row.id, {
    pin_reset_temp_hash: await hashPassword(temp),
    pin_reset_temp_expires_at: expires,
    pin_reset_approved_at: now.toISOString(),
    pin_recover_fails: 0,
    pin_recover_questions: false,
    pin_recover_questions_failed: false,
    updated_at: now.toISOString(),
  });
  await logPasswordResetAudit({
    action: 'staff.pin_reset.approved',
    actorId: auth.userId,
    staffId: target.id,
    staffName: target.name || target.id,
    meta: { approvedAt: now.toISOString(), expiresAt: expires },
  }).catch(() => {});
  return { ok: true, staffId: target.id, tempPassword: temp, expiresAt: expires };
}

export async function rejectStaffPinReset(auth, staffLoginId) {
  const row = await findStaffByIdentifier(staffLoginId);
  if (!row) throw httpError('staff-not-found', 404);
  const target = await getStaffAppUser(staffLoginId);
  if (!target) throw httpError('staff-not-found', 404);
  assertActorCanDecideForStaff(auth, target);
  const now = new Date().toISOString();
  await updateStaffUserRow(getSupabase(), row.id, {
    pin_reset_requested_at: null,
    pin_reset_approved_at: null,
    pin_reset_temp_hash: null,
    pin_reset_temp_expires_at: null,
    updated_at: now,
  });
  await logPasswordResetAudit({
    action: 'staff.pin_reset.rejected',
    actorId: auth.userId,
    staffId: target.id,
    staffName: target.name || target.id,
    meta: { rejectedAt: now },
  }).catch(() => {});
  return { ok: true, staffId: target.id };
}
