import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { T } from '../db/tables.js';
import { getSupabase, gymId } from '../db/supabase/client.js';
import { staffRowToApp } from '../db/supabase/mappers.js';
import { ALL_SECTIONS, DEFAULT_ACCESS, normalizeAccess } from '../../../src/features/access/permissions.js';
import { hashPassword, verifyPassword } from './passwords.js';

function staffClaims(staffLoginId, gymIdValue, gymCodeIdValue) {
  const id = String(staffLoginId || '').trim().toLowerCase();
  const role = id === 'owner' ? 'owner' : 'staff';
  const claims = {
    userId: String(staffLoginId),
    roles: [role],
    permissions: role === 'owner' ? ['*'] : [],
  };
  if (gymIdValue) claims.gymId = String(gymIdValue);
  // gymCodeId is the multi-tenant branch scope; owner has it too (defaults to HQ)
  // but the API layer treats `owner` as cross-branch via apg_jwt_is_owner().
  if (gymCodeIdValue) claims.gymCodeId = String(gymCodeIdValue);
  return claims;
}

export function signStaffToken(staffLoginId, gymIdValue, gymCodeIdValue) {
  return jwt.sign(staffClaims(staffLoginId, gymIdValue, gymCodeIdValue), env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
}

export function verifyStaffToken(rawToken) {
  if (!rawToken) return null;
  try {
    return jwt.verify(rawToken, env.JWT_SECRET);
  } catch {
    return null;
  }
}

export async function findStaffByIdentifier(identifier) {
  const key = String(identifier || '').trim().toLowerCase();
  if (!key) return null;
  const sb = getSupabase();
  const gid = gymId();
  const { data: byId, error: e1 } = await sb
    .from(T.staff_users)
    .select('*')
    .eq('gym_id', gid)
    .ilike('staff_login_id', key)
    .maybeSingle();
  if (e1) throw e1;
  if (byId) return byId;
  const { data: byEmail, error: e2 } = await sb
    .from(T.staff_users)
    .select('*')
    .eq('gym_id', gid)
    .ilike('email', key)
    .maybeSingle();
  if (e2) throw e2;
  return byEmail || null;
}

async function loadStaffAppUser(row) {
  const sb = getSupabase();
  const staffPk = row.id;
  const [secRes, accRes] = await Promise.all([
    sb.from(T.staff_user_sections).select('section_name').eq('staff_user_id', staffPk),
    // Prefer newest row; duplicate access rows (concurrent bulk sync) break maybeSingle().
    sb.from(T.staff_user_access).select('access_json').eq('staff_user_id', staffPk).order('id', { ascending: false }).limit(1),
  ]);
  if (secRes.error) throw secRes.error;
  if (accRes.error) throw accRes.error;
  const sectionNames = (secRes.data || []).map((r) => r.section_name);
  const sections = [...new Set(sectionNames)];
  const access = accRes.data?.[0]?.access_json || {};
  const loginId = String(row.staff_login_id || '').trim().toLowerCase();
  if (loginId === 'owner') {
    return staffRowToApp(row, [...ALL_SECTIONS], normalizeAccess({ ...DEFAULT_ACCESS, ...(access || {}) }));
  }
  return staffRowToApp(row, sections, access);
}

async function ensureOwnerSectionsPersisted(sb, staffPk) {
  const { data: existing } = await sb.from(T.staff_user_sections).select('section_name').eq('staff_user_id', staffPk);
  const have = new Set((existing || []).map((r) => r.section_name));
  const missing = ALL_SECTIONS.filter((name) => !have.has(name));
  if (!missing.length) return;
  await sb.from(T.staff_user_sections).insert(
    missing.map((section_name) => ({ staff_user_id: staffPk, section_name })),
  );
}

export async function loginStaff(identifier, password) {
  const row = await findStaffByIdentifier(identifier);
  if (!row) return { ok: false, error: 'invalid-credentials' };
  if (row.is_blocked) return { ok: false, error: 'user-blocked' };
  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) return { ok: false, error: 'invalid-credentials' };

  const sb = getSupabase();
  const now = new Date().toISOString();
  await sb.from(T.staff_users).update({ last_login_at: now, updated_at: now }).eq('id', row.id);

  const user = await loadStaffAppUser({ ...row, last_login_at: now });
  if (String(user.id || '').toLowerCase() === 'owner') {
    await ensureOwnerSectionsPersisted(sb, row.id).catch(() => {});
  }
  const token = signStaffToken(user.id, row.gym_id, row.gym_code_id);
  return { ok: true, token, user: { ...user, gymCodeId: row.gym_code_id || null, lastLoginAt: now } };
}

export async function getStaffAppUser(staffLoginId) {
  const row = await findStaffByIdentifier(staffLoginId);
  if (!row) return null;
  return loadStaffAppUser(row);
}

export async function setStaffPassword(staffLoginId, newPassword, options = {}) {
  const row = await findStaffByIdentifier(staffLoginId);
  if (!row) throw new Error('staff-not-found');
  const password_hash = await hashPassword(newPassword);
  const sb = getSupabase();
  const now = new Date().toISOString();
  const patch = { password_hash, updated_at: now };
  if (options.clearPasswordReset) {
    patch.password_reset_requested_at = null;
    patch.password_reset_approved_at = now;
  }
  const { error } = await sb.from(T.staff_users).update(patch).eq('id', row.id);
  if (error) throw error;
  return true;
}

export async function requestStaffPasswordReset(identifier) {
  const row = await findStaffByIdentifier(identifier);
  if (!row) return { ok: true };
  if (String(row.staff_login_id || '').toLowerCase() === 'owner') return { ok: true };
  if (row.is_blocked) return { ok: true };
  const sb = getSupabase();
  const now = new Date().toISOString();
  await sb
    .from(T.staff_users)
    .update({
      password_reset_requested_at: now,
      password_reset_approved_at: null,
      updated_at: now,
    })
    .eq('id', row.id);
  return { ok: true };
}

export async function changeStaffPassword(staffLoginId, currentPassword, newPassword) {
  const row = await findStaffByIdentifier(staffLoginId);
  if (!row) return { ok: false, error: 'invalid-credentials' };
  const valid = await verifyPassword(currentPassword, row.password_hash);
  if (!valid) return { ok: false, error: 'invalid-credentials' };
  await setStaffPassword(staffLoginId, newPassword, { clearPasswordReset: true });
  return { ok: true };
}

export function requireOwnerAuth(req, res) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const claims = verifyStaffToken(token);
  if (!claims?.userId) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  req.auth = {
    userId: claims.userId,
    roles: claims.roles || [],
    permissions: claims.permissions || [],
  };
  if (String(claims.userId).toLowerCase() !== 'owner'
    && !(Array.isArray(claims.roles) && claims.roles.includes('owner'))) {
    res.status(403).json({ error: 'owner-required' });
    return null;
  }
  return req.auth;
}
