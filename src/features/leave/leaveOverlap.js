import { dateRangeList, isoDate } from './leaveApprovalSync.js';
import { leaveRequestMatchesStaff } from './leaveBalance.js';

/** Statuses that do not block new leave applications. */
export const LEAVE_NON_BLOCKING_STATUSES = new Set(['rejected', 'cancelled']);

const LEAVE_BLOCKING_STATUSES = new Set([
  'pending',
  'approved',
  'submitted',
  'awaiting approval',
]);

export function normalizeLeaveStatusKey(status) {
  return String(status || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** True when an existing leave row should block overlapping applications. */
export function isBlockingLeaveStatus(status) {
  const key = normalizeLeaveStatusKey(status);
  if (!key) return false;
  if (LEAVE_NON_BLOCKING_STATUSES.has(key)) return false;
  if (LEAVE_BLOCKING_STATUSES.has(key)) return true;
  // Unknown active statuses: block unless explicitly rejected/cancelled.
  return true;
}

/**
 * @param {string} startDate
 * @param {string} endDate
 * @param {object[]} leaveRequests
 * @param {string} staffUserId
 * @param {object} [options]
 * @returns {{ conflicts: string[], hasConflict: boolean, overlappingRequest: object|null }}
 */
export function findLeaveDateConflicts(startDate, endDate, leaveRequests, staffUserId, options = {}) {
  const excludeId = String(options.excludeId || '');
  const aliasMap = options.aliasMap || null;
  const requestedDates = dateRangeList(startDate, endDate);
  if (!requestedDates.length) {
    return { conflicts: [], hasConflict: false, overlappingRequest: null };
  }

  const occupied = new Map();
  for (const req of Array.isArray(leaveRequests) ? leaveRequests : []) {
    if (!req) continue;
    if (excludeId && String(req.id || '') === excludeId) continue;
    if (!leaveRequestMatchesStaff(req.userId, staffUserId, aliasMap)) continue;
    if (!isBlockingLeaveStatus(req.status)) continue;
    for (const day of dateRangeList(req.startDate, req.endDate)) {
      if (!occupied.has(day)) occupied.set(day, req);
    }
  }

  const conflicts = requestedDates.filter((day) => occupied.has(day));
  const overlappingRequest = conflicts.length ? (occupied.get(conflicts[0]) || null) : null;
  return {
    conflicts,
    hasConflict: conflicts.length > 0,
    overlappingRequest,
  };
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatLeaveConflictDate(iso) {
  const raw = String(iso || '').trim();
  const parts = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (parts) {
    const year = Number(parts[1]);
    const month = Number(parts[2]) - 1;
    const day = parts[3];
    const label = MONTH_LABELS[month];
    if (label) return `${day}-${label}-${year}`;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const day = String(d.getUTCDate()).padStart(2, '0');
  const label = MONTH_LABELS[d.getUTCMonth()] || '???';
  return `${day}-${label}-${d.getUTCFullYear()}`;
}

export function formatLeaveOverlapError(conflictDates = []) {
  const unique = [...new Set((Array.isArray(conflictDates) ? conflictDates : []).map((d) => isoDate(d)).filter(Boolean))];
  if (!unique.length) {
    return 'Leave application already exists for one or more selected dates. Please review your existing leave requests before applying again.';
  }
  const bullets = unique.map((d) => `• ${formatLeaveConflictDate(d)}`).join('\n');
  return `You already have a leave request for:\n${bullets}\n\nPlease choose different dates.`;
}
