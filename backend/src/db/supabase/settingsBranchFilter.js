import {
  authHasGlobalBranchRead,
  authIsBranchAdmin,
  resolveReadBranchIds,
} from '../../auth/tenant/scopedAuth.js';
import { isAccessAllowed } from '../../auth/accessControl.js';
import { T } from '../tables.js';

/**
 * Branch IDs for sensitive settings slices (leave, PT). null = all branches (master, no active slice).
 * @param {object|null|undefined} auth
 * @returns {string[]|null}
 */
export function resolveSettingsSensitiveBranchIds(auth) {
  if (!auth) return [];
  const readIds = resolveReadBranchIds(auth);
  if (authHasGlobalBranchRead(auth) && readIds === null) return null;
  return readIds || [];
}

/**
 * @param {object|null|undefined} auth
 * @param {import('../../auth/accessControl.js').NormalizedAccess | { __owner?: boolean } | null} staffAccess
 * @param {'full' | 'core' | 'leave' | 'pt'} settingsScope
 */
export function canReadSettingsScope(auth, staffAccess, settingsScope) {
  if (!auth?.userId) return false;
  if (staffAccess?.__owner || authHasGlobalBranchRead(auth)) return true;
  if (settingsScope === 'core' || settingsScope === 'full') return true;
  if (settingsScope === 'leave') {
    return isAccessAllowed(staffAccess, (a) => a.leave.viewLeaveRequests !== false);
  }
  if (settingsScope === 'pt') {
    return isAccessAllowed(staffAccess, (a) => a.ptClients.viewPtClients !== false);
  }
  return false;
}

/**
 * @param {Map<string, string>} staffBranchByLogin lowercased login -> gym_code_id uuid
 */
export function filterLeaveRequestsForAuth(leaveRequests, auth, staffBranchByLogin) {
  if (!Array.isArray(leaveRequests)) return [];
  if (!auth) return [];
  const readIds = resolveSettingsSensitiveBranchIds(auth);
  if (readIds === null) return leaveRequests;

  const caller = String(auth.userId || '').trim().toLowerCase();
  const isAdmin = authIsBranchAdmin(auth);

  return leaveRequests.filter((req) => {
    const uid = String(req?.userId || '').trim().toLowerCase();
    if (!uid) return false;
    if (!isAdmin) return uid === caller;
    const staffBranch = staffBranchByLogin.get(uid) || '';
    if (!staffBranch) return false;
    return readIds.includes(staffBranch);
  });
}

/**
 * @param {Record<string, unknown>} profiles memberCode -> plan json
 * @param {Map<string, string>} memberBranchByCode member_code -> assigned_gym_code_id
 */
export function filterPtClientProfilesForAuth(profiles, auth, memberBranchByCode) {
  if (!profiles || typeof profiles !== 'object') return {};
  if (!auth) return {};
  const readIds = resolveSettingsSensitiveBranchIds(auth);
  if (readIds === null) return profiles;

  const out = {};
  for (const [memberCode, plan] of Object.entries(profiles)) {
    const branch = memberBranchByCode.get(String(memberCode || '').trim()) || '';
    if (!branch || !readIds.includes(branch)) continue;
    out[memberCode] = plan;
  }
  return out;
}

export function filterRoleTemplatesForAuth(roleTemplates, auth) {
  if (!Array.isArray(roleTemplates)) return [];
  if (!auth) return [];
  if (authIsBranchAdmin(auth)) return roleTemplates;
  return [];
}

export function stripSensitiveSettingsForAuth(settings, auth, staffAccess) {
  if (!settings || typeof settings !== 'object') return {};
  const out = { ...settings };
  const isOwner = staffAccess?.__owner || authHasGlobalBranchRead(auth);
  if (!isOwner) {
    if (!isAccessAllowed(staffAccess, (a) => a.leave.viewLeaveRequests !== false)) {
      out.leaveRequests = [];
    }
    if (!isAccessAllowed(staffAccess, (a) => a.ptClients.viewPtClients !== false)) {
      out.ptClientProfiles = {};
    }
    if (!authIsBranchAdmin(auth)) {
      out.roleTemplates = [];
    }
  }
  return out;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} gid
 * @param {Function} fetchAll
 */
export async function loadStaffBranchByLogin(sb, gid, fetchAll) {
  const rows = await fetchAll((from, to) =>
    sb.from(T.staff_users).select('staff_login_id, gym_code_id').eq('gym_id', gid).range(from, to));
  const map = new Map();
  for (const row of rows || []) {
    const login = String(row.staff_login_id || '').trim().toLowerCase();
    const branch = String(row.gym_code_id || '').trim();
    if (login && branch) map.set(login, branch);
  }
  return map;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} gid
 * @param {string[]} memberCodes
 * @param {Function} chunk
 */
export async function loadMemberBranchByCode(sb, gid, memberCodes, chunkFn) {
  const map = new Map();
  const codes = [...new Set(memberCodes.map((c) => String(c || '').trim()).filter(Boolean))];
  for (const part of chunkFn(codes, 100)) {
    if (!part.length) continue;
    const { data, error } = await sb
      .from(T.members)
      .select('member_code, assigned_gym_code_id')
      .eq('gym_id', gid)
      .in('member_code', part);
    if (error) throw error;
    for (const row of data || []) {
      const code = String(row.member_code || '').trim();
      const branch = String(row.assigned_gym_code_id || '').trim();
      if (code && branch) map.set(code, branch);
    }
  }
  return map;
}

/**
 * V-005: apply branch + RBAC filters to settings payload before returning to client.
 */
export async function applySettingsBranchFilter(settings, auth, staffAccess, settingsScope, deps) {
  if (!settings || typeof settings !== 'object') return settings || {};
  if (!auth) return settings;

  let out = stripSensitiveSettingsForAuth(settings, auth, staffAccess);

  const needsLeave = settingsScope === 'leave' || settingsScope === 'full';
  const needsPt = settingsScope === 'pt' || settingsScope === 'full';
  const needsRoleFilter = settingsScope === 'core' || settingsScope === 'full';

  const readIds = resolveSettingsSensitiveBranchIds(auth);
  const skipBranchFilter = readIds === null;

  if (!skipBranchFilter) {
    if (needsLeave && Array.isArray(out.leaveRequests) && out.leaveRequests.length) {
      const staffMap = await loadStaffBranchByLogin(deps.sb, deps.gid, deps.fetchAll);
      out = {
        ...out,
        leaveRequests: filterLeaveRequestsForAuth(out.leaveRequests, auth, staffMap),
      };
    }

    if (needsPt && out.ptClientProfiles && typeof out.ptClientProfiles === 'object') {
      const codes = Object.keys(out.ptClientProfiles);
      const memberMap = await loadMemberBranchByCode(deps.sb, deps.gid, codes, deps.chunk);
      out = {
        ...out,
        ptClientProfiles: filterPtClientProfilesForAuth(out.ptClientProfiles, auth, memberMap),
      };
    }
  }

  if (needsRoleFilter && Array.isArray(out.roleTemplates)) {
    out = { ...out, roleTemplates: filterRoleTemplatesForAuth(out.roleTemplates, auth) };
  }

  return out;
}
