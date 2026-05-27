import { T } from '../../db/tables.js';
import { getSupabase, gymId } from '../../db/supabase/client.js';
import { fetchAll } from '../../db/supabase/utils.js';
import { normalizeStaffRole, STAFF_ROLES } from './roles.js';

/**
 * @returns {Promise<string[]>} gym_codes.id UUIDs
 */
export async function loadAllowedBranchIdsForStaffRow(staffRow) {
  if (!staffRow?.id) return [];
  const sb = getSupabase();
  const gid = gymId();
  const rows = await fetchAll((from, to) =>
    sb
      .from(T.staff_branch_assignments)
      .select('gym_code_id, is_primary')
      .eq('gym_id', gid)
      .eq('staff_user_id', staffRow.id)
      .order('is_primary', { ascending: false })
      .range(from, to),
  );
  const ids = (rows || []).map((r) => String(r.gym_code_id || '').trim()).filter(Boolean);
  if (ids.length) return [...new Set(ids)];
  const home = String(staffRow.gym_code_id || '').trim();
  return home ? [home] : [];
}

/**
 * @returns {Promise<{ staffRole: string, allowedBranchIds: string[], primaryBranchId: string|null }>}
 */
export async function resolveStaffBranchContext(staffRow) {
  const staffRole = normalizeStaffRole(staffRow?.staff_role, staffRow?.staff_login_id);
  if (staffRole === STAFF_ROLES.MASTER_OWNER) {
    return { staffRole, allowedBranchIds: [], primaryBranchId: staffRow?.gym_code_id || null };
  }
  const allowedBranchIds = await loadAllowedBranchIdsForStaffRow(staffRow);
  const primary = allowedBranchIds[0] || String(staffRow?.gym_code_id || '').trim() || null;
  return { staffRole, allowedBranchIds, primaryBranchId: primary };
}

/**
 * Replace assignments for a staff user (master-only caller enforced at route).
 * @param {string} staffPk staff_users.id
 * @param {string[]} branchIds gym_codes.id list
 * @param {string|null} primaryBranchId
 * @param {string|null} grantedBy login id
 */
export async function syncStaffBranchAssignments(staffPk, branchIds, primaryBranchId, grantedBy = null) {
  const sb = getSupabase();
  const gid = gymId();
  const unique = [...new Set((branchIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const primary = String(primaryBranchId || unique[0] || '').trim();
  const { error: delErr } = await sb
    .from(T.staff_branch_assignments)
    .delete()
    .eq('gym_id', gid)
    .eq('staff_user_id', staffPk);
  if (delErr) throw delErr;
  if (!unique.length) return;
  const rows = unique.map((gym_code_id) => ({
    gym_id: gid,
    staff_user_id: staffPk,
    gym_code_id,
    is_primary: gym_code_id === primary,
    granted_by: grantedBy,
  }));
  const { error: insErr } = await sb.from(T.staff_branch_assignments).insert(rows);
  if (insErr) throw insErr;
}
