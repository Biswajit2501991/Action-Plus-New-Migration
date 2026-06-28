import { T } from '../../db/tables.js';
import { fetchAll, isMissingDbTableError, chunk } from '../../db/supabase/utils.js';
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

const COLLECTION_BY_TABLE = {
  [T.staff_attendance_records]: 'settings',
  [T.leave_requests]: 'settings',
  [T.pt_client_profiles]: 'settings',
  [T.audit_logs]: 'logs',
  [T.settings_lookup_values]: 'settings',
};

let auditGymColCache = null;

function isIgnorableDbError(err) {
  if (isMissingDbTableError(err)) return true;
  const msg = String(err?.message || err);
  return /column.*does not exist|42703/i.test(msg);
}

async function auditLogsHasGymColumn(sb) {
  if (auditGymColCache !== null) return auditGymColCache;
  const { error } = await sb.from(T.audit_logs).select('gym_id').limit(0);
  auditGymColCache = !(error && String(error.message || '').includes('gym_id'));
  return auditGymColCache;
}

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
 * True for E2E factory staff — safe to hard-delete with dependency purge.
 */
export function isTestStaffUser(id, userRow) {
  if (userRow?.testProfile === true) return true;
  const login = String(id || '').trim();
  return login.toLowerCase().startsWith('e2e-staff-');
}

async function purgeOneDependencyTable(sb, gid, check, wantedNorm) {
  const { table, column } = check;
  try {
    let rows;
    if (table === T.audit_logs) {
      const gymScoped = await auditLogsHasGymColumn(sb);
      rows = await fetchAll((from, to) => {
        let q = sb.from(table).select(`id, ${column}`).range(from, to);
        if (gymScoped) q = q.eq('gym_id', gid);
        return q;
      });
    } else {
      rows = await fetchAll((from, to) =>
        sb.from(table).select(`id, ${column}`).eq('gym_id', gid).range(from, to),
      );
    }

    const toRemovePk = (rows || [])
      .filter((r) => wantedNorm.has(String(r?.[column] || '').trim().toLowerCase()))
      .map((r) => r.id)
      .filter((id) => id != null);

    if (!toRemovePk.length) return 0;

    let deleted = 0;
    for (const batch of chunk(toRemovePk, 80)) {
      const { error } = await sb.from(table).delete().in('id', batch);
      if (error) {
        if (isIgnorableDbError(error)) return deleted;
        throw error;
      }
      deleted += batch.length;
    }
    return deleted;
  } catch (err) {
    if (isIgnorableDbError(err)) return 0;
    throw err;
  }
}

/**
 * Best-effort purge of dependency rows blocking hard delete (E2E / test staff only).
 * @returns {{ purged: Record<string, number> }}
 */
export async function purgeStaffDeleteDependencies(loginIds = []) {
  const wanted = [...new Set(
    (Array.isArray(loginIds) ? loginIds : [])
      .map((x) => String(x || '').trim())
      .filter(Boolean),
  )];
  if (!wanted.length) return { purged: {} };

  const sb = getSupabase();
  const gid = gymId();
  const wantedNorm = new Set(wanted.map((id) => id.toLowerCase()));
  const purged = {};
  const collections = new Set();

  for (const check of DEPENDENCY_CHECKS) {
    const count = await purgeOneDependencyTable(sb, gid, check, wantedNorm);
    if (count > 0) {
      purged[check.key] = count;
      const col = COLLECTION_BY_TABLE[check.table];
      if (col) collections.add(col);
    }
  }

  if (collections.size) {
    const { notifyCollectionChange } = await import('../../realtime/supabaseListener.js');
    for (const col of collections) notifyCollectionChange(col);
  }

  return { purged };
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
