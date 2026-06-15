/**
 * Single source of truth for leave approval persistence and list merges.
 */

export function isoDate(val) {
  const d = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function leaveDaysBetween(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 1;
  return Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
}

export function dateRangeList(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const out = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endUtc = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  while (cursor <= endUtc) {
    out.push(isoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export function normalizeLeaveRequestFromApi(request, extras = {}) {
  const r = request && typeof request === 'object' ? request : {};
  const actionAt = extras.actionAt || r.actionAt || new Date().toISOString();
  const actionBy = extras.actionBy || r.actionBy || r.approvedBy || '';
  const rawDays = Number(r.days);
  const days = Number.isFinite(rawDays) && rawDays > 0
    ? rawDays
    : leaveDaysBetween(r.startDate, r.endDate);
  return {
    ...r,
    days,
    status: r.status,
    actionAt,
    actionBy,
    approvedBy: r.approvedBy || actionBy,
  };
}

export function mergeLeaveRequestIntoList(list, updated) {
  const id = String(updated?.id || '').trim();
  const base = Array.isArray(list) ? list : [];
  if (!id) return base;
  const idx = base.findIndex((r) => r && String(r.id) === id);
  if (idx >= 0) {
    const next = base.slice();
    next[idx] = { ...base[idx], ...updated };
    return next;
  }
  return [updated, ...base];
}

/** @deprecated import from leaveBalance.js — kept for registerApgModules compatibility */
export { annualLeaveBalanceRemaining } from './leaveBalance.js';

/**
 * Merge leave rows from GET /settings?scope=leave without clobbering valid cached rows
 * when the server returns an empty slice (RBAC race / transient filter miss).
 */
export function mergeLeaveRequestsFromPull(prev, remote) {
  const prevList = (Array.isArray(prev) ? prev : []).map((r) => normalizeLeaveRequestFromApi(r));
  if (!Array.isArray(remote)) return prevList;
  const remoteList = remote.map((r) => normalizeLeaveRequestFromApi(r));
  if (!remoteList.length) return prevList.length ? prevList : remoteList;
  const byId = new Map();
  for (const r of prevList) {
    if (r?.id) byId.set(String(r.id), r);
  }
  for (const r of remoteList) {
    if (r?.id) byId.set(String(r.id), r);
  }
  return [...byId.values()]
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export function leaveUserIdsMatch(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

/**
 * PATCH /api/leave-requests/:id — returns canonical request or throws.
 * @param {(path: string, init?: object) => Promise<unknown>} backendJsonFn
 */
export async function patchLeaveRequestStatus(backendJsonFn, requestId, status) {
  if (typeof backendJsonFn !== 'function') {
    throw new Error('backend-unavailable');
  }
  const id = String(requestId || '').trim();
  if (!id) throw new Error('leave-id-required');
  const resp = await backendJsonFn(`/leave-requests/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  const request = resp && typeof resp === 'object' && resp.request ? resp.request : null;
  if (!request) throw new Error('leave-patch-empty-response');
  return normalizeLeaveRequestFromApi(request);
}

/**
 * Mark attendance rows as Leave for an approved request (mirrors Leave Tracker page).
 */
export function mergeApprovedLeaveIntoAttendance(existing, request, actor = '') {
  if (!request?.userId || !request.startDate || !request.endDate) return Array.isArray(existing) ? existing : [];
  const days = dateRangeList(request.startDate, request.endDate);
  if (!days.length) return Array.isArray(existing) ? existing : [];
  const base = Array.isArray(existing) ? existing : [];
  const nowIso = new Date().toISOString();
  const noteText = `Leave approved (${request.type || 'Leave'})`;
  const keySet = new Set(days.map((d) => `${d}__${request.userId}`));
  const touched = new Set();
  const next = base.map((row) => {
    const rowDate = isoDate(row.date);
    const key = `${rowDate}__${row.userId}`;
    if (!keySet.has(key)) return row;
    touched.add(key);
    return {
      ...row,
      status: 'Leave',
      leaveRequestId: request.id,
      leaveAutoSynced: true,
      note: row.note ? `${row.note} | ${noteText}` : noteText,
      updatedAt: nowIso,
      updatedBy: actor,
    };
  });
  days.forEach((dayIso) => {
    const key = `${dayIso}__${request.userId}`;
    if (touched.has(key)) return;
    const id = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `att-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    next.unshift({
      id,
      date: dayIso,
      userId: request.userId,
      status: 'Leave',
      checkIn: '',
      checkOut: '',
      note: noteText,
      leaveRequestId: request.id,
      leaveAutoSynced: true,
      markedBy: actor,
      updatedAt: nowIso,
      updatedBy: actor,
    });
  });
  return next;
}
