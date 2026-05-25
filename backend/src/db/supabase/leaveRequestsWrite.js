import crypto from 'node:crypto';
import { T } from '../tables.js';
import { notifyCollectionChange } from '../../realtime/supabaseListener.js';
import { getSupabase, gymId } from './client.js';
import { fetchAll, toDate, toTs } from './utils.js';

export function appLeaveRequestToRow(gid, appRequest) {
  const r = appRequest && typeof appRequest === 'object' ? appRequest : {};
  return {
    gym_id: gid,
    external_request_id: String(r.id || crypto.randomUUID()),
    staff_login_id: String(r.userId || '').trim(),
    leave_type: String(r.type || 'Leave'),
    start_date: toDate(r.startDate),
    end_date: toDate(r.endDate),
    reason: r.reason != null && String(r.reason).trim() ? String(r.reason).trim() : null,
    status: String(r.status || 'Pending'),
    approved_by: r.approvedBy || r.actionBy || null,
    created_at: toTs(r.createdAt) || new Date().toISOString(),
  };
}

export function leaveRowToApp(row) {
  if (!row) return null;
  return {
    id: row.external_request_id,
    userId: row.staff_login_id,
    type: row.leave_type,
    startDate: row.start_date,
    endDate: row.end_date,
    reason: row.reason || '',
    status: row.status,
    approvedBy: row.approved_by,
    createdAt: row.created_at,
  };
}

/** YYYY-MM-DD inclusive overlap. */
export function leaveDateRangesOverlap(startA, endA, startB, endB) {
  const a0 = String(startA || '').trim();
  const a1 = String(endA || '').trim();
  const b0 = String(startB || '').trim();
  const b1 = String(endB || '').trim();
  if (!a0 || !a1 || !b0 || !b1) return false;
  return a0 <= b1 && b0 <= a1;
}

export async function listLeaveRequestsForGym() {
  const sb = getSupabase();
  const gid = gymId();
  const rows = await fetchAll((from, to) =>
    sb.from(T.leave_requests).select('*').eq('gym_id', gid).range(from, to));
  return (rows || []).map(leaveRowToApp).filter(Boolean);
}

/**
 * Insert one leave row (no full settings write / no role-template upsert).
 */
export async function insertLeaveRequest(appRequest) {
  const sb = getSupabase();
  const gid = gymId();
  const row = appLeaveRequestToRow(gid, appRequest);
  if (!row.staff_login_id) throw new Error('leave-user-required');
  if (!row.start_date || !row.end_date) throw new Error('leave-dates-required');

  const { error } = await sb.from(T.leave_requests).insert(row);
  if (error) throw error;
  notifyCollectionChange('settings');
  return appRequest;
}

export async function updateLeaveRequestByExternalId(externalId, patch) {
  const id = String(externalId || '').trim();
  if (!id) throw new Error('leave-id-required');
  const sb = getSupabase();
  const gid = gymId();
  const update = {};
  if (patch?.status != null) update.status = String(patch.status);
  if (patch?.actionBy != null) update.approved_by = String(patch.actionBy);

  const { data, error } = await sb
    .from(T.leave_requests)
    .update(update)
    .eq('gym_id', gid)
    .eq('external_request_id', id)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  notifyCollectionChange('settings');
  return leaveRowToApp(data);
}

export async function deleteLeaveRequestsForUserIds(userIds = []) {
  const wanted = new Set(
    (Array.isArray(userIds) ? userIds : []).map((x) => String(x || '').trim()).filter(Boolean),
  );
  if (!wanted.size) return { removed: 0, remaining: 0 };

  const sb = getSupabase();
  const gid = gymId();
  const rows = await fetchAll((from, to) =>
    sb.from(T.leave_requests).select('id, external_request_id, staff_login_id').eq('gym_id', gid).range(from, to));

  const toRemovePk = (rows || [])
    .filter((r) => wanted.has(String(r.staff_login_id || '')))
    .map((r) => r.id)
    .filter(Boolean);

  for (const part of chunkIds(toRemovePk, 80)) {
    if (!part.length) continue;
    const { error } = await sb.from(T.leave_requests).delete().in('id', part);
    if (error) throw error;
  }

  const remaining = (rows || []).length - toRemovePk.length;
  if (toRemovePk.length) notifyCollectionChange('settings');
  return { removed: toRemovePk.length, remaining };
}

function chunkIds(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Pending leave overlap for same staff user (optional block duplicate submissions).
 */
export async function findOverlappingPendingLeave(userId, startDate, endDate, excludeId = '') {
  const uid = String(userId || '').trim();
  const rows = await listLeaveRequestsForGym();
  return rows.find((r) => {
    if (String(r.id) === String(excludeId || '')) return false;
    if (String(r.userId || '') !== uid) return false;
    const st = String(r.status || '').toLowerCase();
    if (st !== 'pending') return false;
    return leaveDateRangesOverlap(startDate, endDate, r.startDate, r.endDate);
  }) || null;
}
