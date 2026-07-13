import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { T } from '../db/tables.js';
import { getSupabase, gymId } from '../db/supabase/client.js';
import { staffRowToApp } from '../db/supabase/mappers.js';
import {
  enrichStaffUserWithPhotoUrl,
  staffPhotoMetaFromRow,
} from '../services/staffPhoto/StaffPhotoService.js';
import { updateStaffUserRow } from '../db/supabase/staffUsersWrite.js';
import { ALL_SECTIONS, DEFAULT_ACCESS, normalizeAccess } from '../../../src/features/access/permissions.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { loadAllowedBranchIdsForStaffRow, resolveStaffBranchContext } from './tenant/branchAssignments.js';
import { normalizeStaffRole, STAFF_ROLES } from './tenant/roles.js';

function staffClaims(staffLoginId, gymIdValue, branchContext = {}) {
  const id = String(staffLoginId || '').trim().toLowerCase();
  const staffRole = branchContext.staffRole || (id === 'owner' ? STAFF_ROLES.MASTER_OWNER : STAFF_ROLES.STAFF);
  const isMaster = staffRole === STAFF_ROLES.MASTER_OWNER;
  const isBranchOwner = staffRole === STAFF_ROLES.BRANCH_OWNER;
  const roles = isMaster ? ['owner'] : (isBranchOwner ? ['branch_owner'] : ['staff']);
  const claims = {
    userId: String(staffLoginId),
    roles,
    staffRole,
    permissions: isMaster ? ['*'] : [],
  };
  if (gymIdValue) claims.gymId = String(gymIdValue);
  const activeBranch = String(branchContext.activeBranchId || branchContext.primaryBranchId || '').trim();
  if (activeBranch) {
    claims.gymCodeId = activeBranch;
    claims.activeBranchId = activeBranch;
  }
  const allowed = Array.isArray(branchContext.allowedBranchIds)
    ? branchContext.allowedBranchIds.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  if (allowed.length) claims.allowedBranchIds = [...new Set(allowed)];
  return claims;
}

export function signStaffToken(staffLoginId, gymIdValue, branchContext = {}) {
  const ctx = typeof branchContext === 'string'
    ? { activeBranchId: branchContext, staffRole: STAFF_ROLES.STAFF, allowedBranchIds: [] }
    : branchContext;
  return jwt.sign(staffClaims(staffLoginId, gymIdValue, ctx), env.JWT_SECRET, {
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

function pickFirstStaffRow(rows) {
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function findStaffByIdentifier(identifier) {
  const key = String(identifier || '').trim().toLowerCase();
  if (!key) return null;
  const sb = getSupabase();
  const gid = gymId();
  // maybeSingle() returns an error when duplicate logins exist; take newest row instead.
  const { data: byIdRows, error: e1 } = await sb
    .from(T.staff_users)
    .select('*')
    .eq('gym_id', gid)
    .ilike('staff_login_id', key)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (e1) throw e1;
  const byId = pickFirstStaffRow(byIdRows);
  if (byId) return byId;
  const { data: byEmailRows, error: e2 } = await sb
    .from(T.staff_users)
    .select('*')
    .eq('gym_id', gid)
    .ilike('email', key)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (e2) throw e2;
  return pickFirstStaffRow(byEmailRows);
}

async function fetchStaffAccessJson(sb, staffPk) {
  let res = await sb
    .from(T.staff_user_access)
    .select('access_json')
    .eq('staff_user_id', staffPk)
    .order('id', { ascending: false })
    .limit(1);
  if (res.error && /column.*\bid\b/i.test(String(res.error.message || res.error))) {
    res = await sb
      .from(T.staff_user_access)
      .select('access_json')
      .eq('staff_user_id', staffPk)
      .limit(1);
  }
  if (res.error) throw res.error;
  const raw = res.data?.[0]?.access_json;
  return raw && typeof raw === 'object' ? raw : {};
}

async function loadStaffAppUser(row) {
  const sb = getSupabase();
  const staffPk = row.id;
  const [secRes, access, assignedBranchIds] = await Promise.all([
    sb.from(T.staff_user_sections).select('section_name').eq('staff_user_id', staffPk),
    fetchStaffAccessJson(sb, staffPk),
    loadAllowedBranchIdsForStaffRow(row),
  ]);
  if (secRes.error) throw secRes.error;
  const sectionNames = (secRes.data || []).map((r) => r.section_name);
  const sections = [...new Set(sectionNames)];
  const loginId = String(row.staff_login_id || '').trim().toLowerCase();
  const base = loginId === 'owner'
    ? staffRowToApp(
      row,
      [...ALL_SECTIONS],
      normalizeAccess({ ...DEFAULT_ACCESS, ...(access || {}) }),
      assignedBranchIds,
    )
    : staffRowToApp(row, sections, access, assignedBranchIds);
  // Signed URL for header avatar after login (any staff — not only admins).
  return enrichStaffUserWithPhotoUrl({ ...base, ...staffPhotoMetaFromRow(row) }, row);
}

function normalizeBranchIdList(ids) {
  return [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
}

export function branchIdsMatch(a, b) {
  const left = normalizeBranchIdList(a).sort();
  const right = normalizeBranchIdList(b).sort();
  return left.length === right.length && left.every((id, i) => id === right[i]);
}

/** DB-backed branch profile for login and /auth/me (never trust JWT alone). */
export async function resolveAuthBranchProfile(staffLoginId, claims = {}) {
  const row = await findStaffByIdentifier(staffLoginId);
  const user = row ? await loadStaffAppUser(row) : null;
  const tokenCtx = row ? await buildStaffTokenContext(row) : null;
  const allowedFromDb = normalizeBranchIdList(tokenCtx?.allowedBranchIds);
  const allowedFromClaims = normalizeBranchIdList(claims.allowedBranchIds);
  const allowedBranchIds = allowedFromDb.length
    ? allowedFromDb
    : (allowedFromClaims.length
      ? allowedFromClaims
      : (user?.gymCodeId ? [String(user.gymCodeId)] : []));
  const assignedBranchIds = normalizeBranchIdList(user?.assignedBranchIds).length
    ? normalizeBranchIdList(user.assignedBranchIds)
    : allowedBranchIds;
  const activeFromClaims = String(claims.activeBranchId || claims.gymCodeId || '').trim();
  const activeBranchId = (activeFromClaims && allowedBranchIds.includes(activeFromClaims))
    ? activeFromClaims
    : (String(tokenCtx?.activeBranchId || user?.gymCodeId || '').trim() || allowedBranchIds[0] || null);
  const claimsStale = allowedFromDb.length > 0 && !branchIdsMatch(allowedFromDb, allowedFromClaims);
  return {
    row,
    user,
    tokenCtx,
    allowedBranchIds,
    assignedBranchIds,
    activeBranchId,
    gymCodeId: activeBranchId,
    claimsStale,
  };
}

export async function buildStaffTokenContext(row) {
  try {
    const branchContext = await resolveStaffBranchContext(row);
    return {
      staffRole: branchContext.staffRole,
      allowedBranchIds: branchContext.allowedBranchIds,
      activeBranchId: branchContext.primaryBranchId,
      primaryBranchId: branchContext.primaryBranchId,
    };
  } catch (err) {
    const staffRole = normalizeStaffRole(row?.staff_role, row?.staff_login_id);
    const home = String(row?.gym_code_id || '').trim();
    const allowedBranchIds = home ? [home] : [];
    console.error('[auth] buildStaffTokenContext fallback:', err?.message || err);
    return {
      staffRole,
      allowedBranchIds,
      activeBranchId: home || null,
      primaryBranchId: home || null,
    };
  }
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
  const { error: touchErr } = await sb
    .from(T.staff_users)
    .update({ last_login_at: now, updated_at: now })
    .eq('id', row.id);
  if (touchErr) throw touchErr;

  const user = await loadStaffAppUser({ ...row, last_login_at: now });
  if (String(user.id || '').toLowerCase() === 'owner') {
    await ensureOwnerSectionsPersisted(sb, row.id).catch(() => {});
  }
  const profile = await resolveAuthBranchProfile(user.id, {});
  const tokenCtx = profile.tokenCtx || await buildStaffTokenContext(row);
  const token = signStaffToken(user.id, row.gym_id, {
    ...tokenCtx,
    activeBranchId: profile.activeBranchId || tokenCtx.activeBranchId,
  });
  return {
    ok: true,
    token,
    user: {
      ...user,
      staffRole: tokenCtx.staffRole,
      gymCodeId: profile.gymCodeId,
      assignedBranchIds: profile.assignedBranchIds,
      allowedBranchIds: profile.allowedBranchIds,
      activeBranchId: profile.activeBranchId,
      lastLoginAt: now,
    },
  };
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
    patch.password_reset_rejected_at = null;
    patch.password_reset_rejected_by = null;
  }
  await updateStaffUserRow(sb, row.id, patch);
  return true;
}

export async function requestStaffPasswordReset(identifier) {
  const { requestStaffPasswordResetWithAudit } = await import('./passwordReset/passwordResetRequestService.js');
  return requestStaffPasswordResetWithAudit(identifier);
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
