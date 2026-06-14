import { T } from '../../db/tables.js';
import { fetchAll, isMissingDbTableError } from '../../db/supabase/utils.js';
import { getSupabase, gymId } from '../../db/supabase/client.js';

const DEPENDENCY_CHECKS = [
  {
    key: 'attendance',
    label: 'Attendance',
    table: T.staff_attendance_records,
    column: 'staff_login_id',
  },
  {
    key: 'leave',
    label: 'Leave Tracker',
    table: T.leave_requests,
    column: 'staff_login_id',
  },
  {
    key: 'ptClients',
    label: 'PT Clients',
    table: T.pt_client_profiles,
    column: 'trainer_staff_code',
  },
  {
    key: 'auditLogs',
    label: 'Audit Logs',
    table: T.audit_logs,
    column: 'actor_id',
  },
  {
    key: 'settingsLookups',
    label: 'Settings Lookups',
    table: T.settings_lookup_values,
    column: 'created_by_staff_login_id',
  },
];

async function hasStaffReference(sb, gid, { table, column }, loginId) {
  const login = String(loginId || '').trim();
  if (!login) return false;
  try {
    const { data, error } = await sb
      .from(table)
      .select('id')
      .eq('gym_id', gid)
      .ilike(column, login)
      .limit(1);
    if (error) {
      if (isMissingDbTableError(error)) return false;
      const msg = String(error.message || error);
      if (/column.*does not exist|42703/i.test(msg)) return false;
      throw error;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    if (isMissingDbTableError(err)) return false;
    const msg = String(err?.message || err);
    if (/column.*does not exist|42703/i.test(msg)) return false;
    throw err;
  }
}

/**
 * Returns dependency keys blocking hard delete for a staff login id.
 * Historical rows are intentionally retained — callers should deactivate instead.
 */
export async function findStaffDeleteDependencies(loginId) {
  const sb = getSupabase();
  const gid = gymId();
  const login = String(loginId || '').trim();
  if (!login) return [];

  const found = [];
  for (const check of DEPENDENCY_CHECKS) {
    const hit = await hasStaffReference(sb, gid, check, login);
    if (hit) found.push(check.key);
  }
  return found;
}

/**
 * Batch dependency lookup for cleanup endpoint.
 * @returns {Map<string, string[]>} loginId -> dependency keys
 */
export async function findStaffDeleteDependenciesBatch(loginIds = []) {
  const wanted = [...new Set(
    (Array.isArray(loginIds) ? loginIds : [])
      .map((x) => String(x || '').trim())
      .filter(Boolean),
  )];
  const out = new Map();
  for (const id of wanted) {
    const deps = await findStaffDeleteDependencies(id);
    if (deps.length) out.set(id, deps);
  }
  return out;
}
