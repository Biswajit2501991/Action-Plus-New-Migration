import {
  leaveDaysBetween,
  normalizeLeaveRequestFromApi,
} from './leaveApprovalSync.js';

export const DEFAULT_ANNUAL_LEAVE_DAYS = 24;

/** @param {Array<{ id?: string, name?: string, email?: string }>} users */
export function buildStaffLoginAliasMap(users = []) {
  const map = new Map();
  for (const u of users) {
    const canonical = String(u?.id || '').trim().toLowerCase();
    if (!canonical) continue;
    const aliases = [
      u.id,
      u.name,
      u.email ? String(u.email).split('@')[0] : '',
    ]
      .map((x) => String(x || '').trim().toLowerCase())
      .filter(Boolean);
    for (const alias of aliases) map.set(alias, canonical);
  }
  return map;
}

/** @param {Map<string, string>|null|undefined} aliasMap */
export function resolveCanonicalLeaveUserId(userId, aliasMap) {
  const key = String(userId || '').trim().toLowerCase();
  if (!key) return '';
  if (aliasMap && typeof aliasMap.get === 'function') {
    return aliasMap.get(key) || key;
  }
  return key;
}

export function leaveRequestMatchesStaff(reqUserId, staffUserId, aliasMap = null) {
  const req = resolveCanonicalLeaveUserId(reqUserId, aliasMap);
  const staff = resolveCanonicalLeaveUserId(staffUserId, aliasMap);
  return Boolean(req && staff && req === staff);
}

export function effectiveLeaveDays(request) {
  const normalized = normalizeLeaveRequestFromApi(request);
  const n = Number(normalized.days);
  if (Number.isFinite(n) && n > 0) return n;
  return leaveDaysBetween(normalized.startDate, normalized.endDate);
}

export function isApprovedLeaveInYear(request, year) {
  if (String(request?.status || '') !== 'Approved') return false;
  const start = new Date(request.startDate);
  if (Number.isNaN(start.getTime())) return false;
  return start.getFullYear() === year;
}

/**
 * @param {object[]} leaveRequests
 * @param {string} staffUserId
 * @param {number} year
 * @param {Map<string, string>|null} aliasMap
 */
export function approvedLeaveDaysUsed(leaveRequests, staffUserId, year, aliasMap = null) {
  const staffKey = resolveCanonicalLeaveUserId(staffUserId, aliasMap);
  if (!staffKey) return 0;
  return (Array.isArray(leaveRequests) ? leaveRequests : [])
    .filter((r) => leaveRequestMatchesStaff(r?.userId, staffKey, aliasMap)
      && isApprovedLeaveInYear(r, year))
    .reduce((sum, r) => sum + effectiveLeaveDays(r), 0);
}

/**
 * @param {object[]} adjustments
 * @param {string} staffUserId
 * @param {number} year
 */
export function adjustmentDaysForStaff(adjustments, staffUserId, year) {
  const staffKey = String(staffUserId || '').trim().toLowerCase();
  let total = 0;
  for (const row of Array.isArray(adjustments) ? adjustments : []) {
    if (Number(row?.calendarYear || row?.calendar_year) !== year) continue;
    const scope = String(row?.scope || 'global').trim().toLowerCase();
    const days = Number(row?.adjustmentDays ?? row?.adjustment_days ?? 0);
    if (!Number.isFinite(days) || days === 0) continue;
    if (scope === 'global') {
      total += days;
      continue;
    }
    const target = String(row?.staffLoginId || row?.staff_login_id || '').trim().toLowerCase();
    if (target && target === staffKey) total += days;
  }
  return total;
}

/**
 * @param {object[]} leaveRequests
 * @param {string} userId
 * @param {object} [options]
 */
export function annualLeaveBalanceRemaining(leaveRequests, userId, options = {}) {
  const year = Number(options.year) || new Date().getFullYear();
  const baseDays = Number(options.baseDays ?? options.annualAllowance ?? DEFAULT_ANNUAL_LEAVE_DAYS);
  const aliasMap = options.aliasMap || null;
  const adjustments = options.adjustments || [];
  const staffKey = resolveCanonicalLeaveUserId(userId, aliasMap);
  if (!staffKey) return Math.max(0, baseDays);
  const used = approvedLeaveDaysUsed(leaveRequests, staffKey, year, aliasMap);
  const adj = adjustmentDaysForStaff(adjustments, staffKey, year);
  return Math.max(0, baseDays + adj - used);
}

/**
 * @param {Array<{ id: string, name?: string }>} staff
 * @param {object[]} leaveRequests
 * @param {object[]} adjustments
 * @param {object} [options]
 */
export function buildLeaveBalancePreviewRows(staff, leaveRequests, adjustments, options = {}) {
  const year = Number(options.year) || new Date().getFullYear();
  const baseDays = Number(options.baseDays ?? DEFAULT_ANNUAL_LEAVE_DAYS);
  const aliasMap = buildStaffLoginAliasMap(staff);
  return (Array.isArray(staff) ? staff : []).map((s) => {
    const current = annualLeaveBalanceRemaining(leaveRequests, s.id, {
      year,
      baseDays,
      adjustments,
      aliasMap,
    });
    return {
      userId: s.id,
      name: s.name || s.id,
      current,
    };
  });
}

/** Apply a global delta to preview rows (no persistence). */
export function applyGlobalAdjustmentPreview(rows, deltaDays) {
  const n = Number(deltaDays);
  if (!Number.isFinite(n) || n === 0) return rows;
  return rows.map((row) => ({
    ...row,
    next: Math.max(0, Number(row.current || 0) + n),
  }));
}
