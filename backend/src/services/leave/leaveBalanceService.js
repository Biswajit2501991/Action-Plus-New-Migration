import { T } from '../../db/tables.js';
import { getSupabase, gymId } from '../../db/supabase/client.js';
import { fetchAll } from '../../db/supabase/utils.js';
import { listLeaveRequestsForGym } from '../../db/supabase/leaveRequestsWrite.js';
import { isMissingDbTableError } from '../../db/supabase/utils.js';

const MIGRATION_HINT =
  'Run backend/migrations/supabase_leave_balance_adjustments.sql and '
  + 'backend/migrations/supabase_leave_balance_adjustments_rls.sql in Supabase SQL Editor.';

export const DEFAULT_BASE_LEAVE_DAYS = 24;

function rethrowLeaveBalanceDbError(error) {
  if (isMissingDbTableError(error)) {
    throw Object.assign(new Error('leave-balance-table-missing'), {
      status: 503,
      detail: MIGRATION_HINT,
    });
  }
  throw error;
}

/** @param {Record<string, unknown>} row */
export function adjustmentRowToApp(row) {
  if (!row) return null;
  return {
    id: String(row.id || ''),
    calendarYear: Number(row.calendar_year || 0),
    adjustmentDays: Number(row.adjustment_days || 0),
    scope: String(row.scope || 'global'),
    staffLoginId: row.staff_login_id == null ? null : String(row.staff_login_id),
    reason: row.reason == null ? '' : String(row.reason),
    balanceSnapshot: row.balance_snapshot_json && typeof row.balance_snapshot_json === 'object'
      ? row.balance_snapshot_json
      : null,
    createdBy: row.created_by == null ? null : String(row.created_by),
    createdAt: row.created_at || null,
  };
}

export async function listLeaveBalanceAdjustments(calendarYear) {
  const sb = getSupabase();
  const gid = gymId();
  const year = Number(calendarYear) || new Date().getFullYear();
  try {
    const rows = await fetchAll((from, to) => sb
      .from(T.leave_balance_adjustments)
      .select('*')
      .eq('gym_id', gid)
      .eq('calendar_year', year)
      .order('created_at', { ascending: true })
      .range(from, to));
    return (rows || []).map(adjustmentRowToApp).filter(Boolean);
  } catch (err) {
    rethrowLeaveBalanceDbError(err);
  }
}

async function listActiveStaffForGym() {
  const sb = getSupabase();
  const gid = gymId();
  const rows = await fetchAll((from, to) => sb
    .from(T.staff_users)
    .select('staff_login_id, full_name, email, is_blocked')
    .eq('gym_id', gid)
    .range(from, to));
  return (rows || [])
    .filter((r) => !r.is_blocked)
    .map((r) => ({
      id: String(r.staff_login_id || ''),
      name: String(r.full_name || r.staff_login_id || ''),
      email: r.email == null ? '' : String(r.email),
    }))
    .filter((s) => s.id);
}

function buildAliasMapFromStaff(staff) {
  const map = new Map();
  for (const s of staff) {
    const canonical = String(s.id || '').trim().toLowerCase();
    if (!canonical) continue;
    const aliases = [s.id, s.name, s.email ? String(s.email).split('@')[0] : '']
      .map((x) => String(x || '').trim().toLowerCase())
      .filter(Boolean);
    for (const alias of aliases) map.set(alias, canonical);
  }
  return map;
}

function resolveCanonicalUserId(userId, aliasMap) {
  const key = String(userId || '').trim().toLowerCase();
  if (!key) return '';
  return aliasMap.get(key) || key;
}

function computeBalanceForStaff(staffId, leaveRequests, adjustments, year, baseDays, aliasMap) {
  const staffKey = resolveCanonicalUserId(staffId, aliasMap);
  let adj = 0;
  for (const row of adjustments) {
    const scope = String(row?.scope || 'global').toLowerCase();
    const days = Number(row?.adjustmentDays || 0);
    if (!Number.isFinite(days) || days === 0) continue;
    if (scope === 'global') adj += days;
    else if (resolveCanonicalUserId(row?.staffLoginId, aliasMap) === staffKey) adj += days;
  }
  let used = 0;
  for (const r of leaveRequests) {
    if (String(r?.status || '') !== 'Approved') continue;
    if (resolveCanonicalUserId(r?.userId, aliasMap) !== staffKey) continue;
    const start = new Date(r.startDate);
    if (Number.isNaN(start.getTime()) || start.getFullYear() !== year) continue;
    const d = Number(r.days);
    used += Number.isFinite(d) && d > 0 ? d : 1;
  }
  return Math.max(0, baseDays + adj - used);
}

export async function buildLeaveBalanceSnapshot(calendarYear, baseDays = DEFAULT_BASE_LEAVE_DAYS) {
  const year = Number(calendarYear) || new Date().getFullYear();
  const [staff, leaveRequests, adjustments] = await Promise.all([
    listActiveStaffForGym(),
    listLeaveRequestsForGym(),
    listLeaveBalanceAdjustments(year),
  ]);
  const rows = staff.map((s) => {
    const aliasMap = buildAliasMapFromStaff(staff);
    const balance = computeBalanceForStaff(s.id, leaveRequests, adjustments, year, baseDays, aliasMap);
    return {
      userId: s.id,
      name: s.name,
      balance,
    };
  });
  return {
    calendarYear: year,
    baseDays,
    adjustments,
    rows,
  };
}

export async function previewGlobalLeaveAdjustment(adjustmentDays, calendarYear, baseDays = DEFAULT_BASE_LEAVE_DAYS) {
  const delta = Number(adjustmentDays);
  if (!Number.isFinite(delta) || delta === 0) {
    const err = new Error('adjustment-days-required');
    err.status = 400;
    throw err;
  }
  if (Math.abs(delta) > 30) {
    const err = new Error('adjustment-days-out-of-range');
    err.status = 400;
    throw err;
  }
  const snapshot = await buildLeaveBalanceSnapshot(calendarYear, baseDays);
  const preview = snapshot.rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    current: row.balance,
    next: Math.max(0, row.balance + delta),
  }));
  return {
    calendarYear: snapshot.calendarYear,
    baseDays: snapshot.baseDays,
    adjustmentDays: delta,
    affectedCount: preview.length,
    rows: preview,
  };
}

export async function applyGlobalLeaveAdjustment(adjustmentDays, calendarYear, createdBy, reason = '') {
  const preview = await previewGlobalLeaveAdjustment(adjustmentDays, calendarYear);
  const sb = getSupabase();
  const gid = gymId();
  const nowIso = new Date().toISOString();
  const insertRow = {
    gym_id: gid,
    calendar_year: preview.calendarYear,
    adjustment_days: preview.adjustmentDays,
    scope: 'global',
    staff_login_id: null,
    reason: String(reason || '').trim() || null,
    balance_snapshot_json: {
      preview: preview.rows,
      appliedAt: nowIso,
    },
    created_by: String(createdBy || '').trim() || null,
    created_at: nowIso,
  };
  try {
    const { data, error } = await sb
      .from(T.leave_balance_adjustments)
      .insert(insertRow)
      .select('*')
      .single();
    if (error) throw error;
    const after = await buildLeaveBalanceSnapshot(preview.calendarYear, preview.baseDays);
    return {
      adjustment: adjustmentRowToApp(data),
      balances: after.rows,
      calendarYear: preview.calendarYear,
    };
  } catch (err) {
    rethrowLeaveBalanceDbError(err);
  }
}
