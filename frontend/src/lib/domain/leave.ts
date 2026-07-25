import type { LeaveRequest, StaffUser } from "@/types";
import { localCalendarDateKey } from "@/lib/domain/billing";

export const LEAVE_TYPES = ["Casual", "Sick", "Emergency", "Unpaid"] as const;
export const DEFAULT_ANNUAL_LEAVE_DAYS = 24;

export function leaveDaysBetween(startDate?: string | null, endDate?: string | null) {
  const start = localCalendarDateKey(startDate || "");
  const end = localCalendarDateKey(endDate || "");
  if (!start || !end || end < start) return 1;
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const a = new Date(sy, sm - 1, sd);
  const b = new Date(ey, em - 1, ed);
  return Math.floor((b.getTime() - a.getTime()) / 86400000) + 1;
}

export function dateRangeList(startIso?: string | null, endIso?: string | null) {
  const start = localCalendarDateKey(startIso || "");
  const end = localCalendarDateKey(endIso || "");
  if (!start || !end || start > end) return [] as string[];
  const out: string[] = [];
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const cursor = new Date(sy, sm - 1, sd);
  const last = new Date(ey, em - 1, ed);
  while (cursor <= last) {
    out.push(localCalendarDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function normalizeLeaveStatus(status?: string | null) {
  const raw = String(status || "").trim();
  if (!raw) return "Pending";
  const key = raw.toLowerCase();
  if (key === "pending") return "Pending";
  if (key === "approved") return "Approved";
  if (key === "rejected") return "Rejected";
  if (key === "cancelled" || key === "canceled") return "Cancelled";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function normalizeLeaveRequest(raw: LeaveRequest | Record<string, unknown> | null | undefined): LeaveRequest {
  const r = (raw && typeof raw === "object" ? raw : {}) as LeaveRequest;
  const startDate = String(r.startDate || r.fromDate || "").slice(0, 10);
  const endDate = String(r.endDate || r.toDate || "").slice(0, 10);
  const daysRaw = Number(r.days);
  const days =
    Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : leaveDaysBetween(startDate, endDate);
  return {
    ...r,
    id: String(r.id || ""),
    userId: String(r.userId || r.staffId || "").trim(),
    staffId: String(r.staffId || r.userId || "").trim(),
    type: String(r.type || "Casual"),
    startDate,
    endDate,
    fromDate: startDate,
    toDate: endDate,
    days,
    reason: String(r.reason || ""),
    status: normalizeLeaveStatus(r.status),
  };
}

export function buildStaffLoginAliasMap(users: StaffUser[] = []) {
  const map = new Map<string, string>();
  for (const u of users) {
    const canonical = String(u?.id || "")
      .trim()
      .toLowerCase();
    if (!canonical) continue;
    const aliases = [u.id, u.name, u.email ? String(u.email).split("@")[0] : ""]
      .map((x) => String(x || "").trim().toLowerCase())
      .filter(Boolean);
    for (const alias of aliases) map.set(alias, canonical);
  }
  return map;
}

export function resolveCanonicalLeaveUserId(
  userId?: string | null,
  aliasMap?: Map<string, string> | null,
) {
  const key = String(userId || "")
    .trim()
    .toLowerCase();
  if (!key) return "";
  if (aliasMap) return aliasMap.get(key) || key;
  return key;
}

export function leaveRequestMatchesStaff(
  reqUserId?: string | null,
  staffUserId?: string | null,
  aliasMap?: Map<string, string> | null,
) {
  const req = resolveCanonicalLeaveUserId(reqUserId, aliasMap);
  const staff = resolveCanonicalLeaveUserId(staffUserId, aliasMap);
  return Boolean(req && staff && req === staff);
}

/** Owners / managers / branch admins can review everyone’s leave. */
export function canReviewAllLeave(user: {
  id?: string | null;
  staffRole?: string | null;
  role?: string | null;
} | null | undefined) {
  if (!user) return false;
  const id = String(user.id || "").trim().toLowerCase();
  if (id === "owner" || id === "manager") return true;
  const role = String(user.staffRole || user.role || "")
    .trim()
    .toLowerCase();
  return role.includes("owner") || role.includes("manager") || role.includes("admin");
}

/** Keep only the signed-in staff member’s leave rows (owners see all). */
export function filterLeaveRequestsForViewer(
  requests: LeaveRequest[] | null | undefined,
  viewerId: string | null | undefined,
  options: {
    reviewAll?: boolean;
    aliasMap?: Map<string, string> | null;
  } = {},
) {
  const list = Array.isArray(requests) ? requests : [];
  if (options.reviewAll) return list;
  const viewer = String(viewerId || "").trim();
  if (!viewer) return [];
  return list.filter((r) =>
    leaveRequestMatchesStaff(r.userId || r.staffId, viewer, options.aliasMap || null),
  );
}

const LEAVE_NON_BLOCKING = new Set(["rejected", "cancelled", "canceled"]);
const LEAVE_BLOCKING = new Set(["pending", "approved", "submitted", "awaiting approval"]);

export function isBlockingLeaveStatus(status?: string | null) {
  const key = String(status || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!key) return false;
  if (LEAVE_NON_BLOCKING.has(key)) return false;
  if (LEAVE_BLOCKING.has(key)) return true;
  return true;
}

export function findLeaveDateConflicts(
  startDate: string,
  endDate: string,
  leaveRequests: LeaveRequest[],
  staffUserId: string,
  options: { excludeId?: string; aliasMap?: Map<string, string> | null } = {},
) {
  const requestedDates = dateRangeList(startDate, endDate);
  if (!requestedDates.length) {
    return { conflicts: [] as string[], hasConflict: false, overlappingRequest: null as LeaveRequest | null };
  }
  const excludeId = String(options.excludeId || "");
  const occupied = new Map<string, LeaveRequest>();
  for (const req of leaveRequests || []) {
    if (!req) continue;
    if (excludeId && String(req.id || "") === excludeId) continue;
    if (!leaveRequestMatchesStaff(req.userId || req.staffId, staffUserId, options.aliasMap)) continue;
    if (!isBlockingLeaveStatus(req.status)) continue;
    for (const day of dateRangeList(req.startDate || req.fromDate, req.endDate || req.toDate)) {
      if (!occupied.has(day)) occupied.set(day, req);
    }
  }
  const conflicts = requestedDates.filter((day) => occupied.has(day));
  return {
    conflicts,
    hasConflict: conflicts.length > 0,
    overlappingRequest: conflicts.length ? occupied.get(conflicts[0]) || null : null,
  };
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatLeaveConflictDate(iso?: string | null) {
  const raw = String(iso || "").trim();
  const parts = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (parts) {
    const year = Number(parts[1]);
    const month = Number(parts[2]) - 1;
    const day = parts[3];
    return `${day}-${MONTH_LABELS[month] || "???"}-${year}`;
  }
  return raw || "—";
}

export function formatLeaveOverlapError(conflictDates: string[] = []) {
  const unique = [...new Set(conflictDates.map((d) => localCalendarDateKey(d)).filter(Boolean))];
  if (!unique.length) {
    return "Leave application already exists for one or more selected dates. Please review your existing leave requests before applying again.";
  }
  const bullets = unique.map((d) => `• ${formatLeaveConflictDate(d)}`).join("\n");
  return `You already have a leave request for:\n${bullets}\n\nPlease choose different dates.`;
}

export function leaveSubmitErrorMessage(err: {
  message?: string;
  status?: number;
  code?: string;
  conflictDates?: string[];
}) {
  const code = String(err?.code || "").trim();
  const status = Number(err?.status || 0);
  if (status === 409 || code === "leave-overlap") {
    return formatLeaveOverlapError(err?.conflictDates || []);
  }
  if (code === "invalid-userId") return "Staff account not found. Check the username with your owner.";
  if (code === "date-range-required" || code === "invalid-dates") {
    return "Please enter valid start and end dates.";
  }
  if (code === "end-before-start") return "End date cannot be before start date.";
  const detail = String(err?.message || "").trim();
  if (detail && !detail.startsWith("backend-")) return `Could not submit leave: ${detail}`;
  return "Could not submit leave request. Please try again.";
}

export function annualLeaveBalanceRemaining(
  leaveRequests: LeaveRequest[],
  userId: string,
  options: {
    year?: number;
    baseDays?: number;
    aliasMap?: Map<string, string> | null;
    adjustments?: Array<{
      calendarYear?: number;
      calendar_year?: number;
      scope?: string;
      adjustmentDays?: number;
      adjustment_days?: number;
      staffLoginId?: string;
      staff_login_id?: string;
    }>;
  } = {},
) {
  const year = Number(options.year) || new Date().getFullYear();
  const baseDays = Number(options.baseDays ?? DEFAULT_ANNUAL_LEAVE_DAYS);
  const aliasMap = options.aliasMap || null;
  const staffKey = resolveCanonicalLeaveUserId(userId, aliasMap);
  if (!staffKey) return Math.max(0, baseDays);

  let used = 0;
  for (const r of leaveRequests || []) {
    if (normalizeLeaveStatus(r.status) !== "Approved") continue;
    if (!leaveRequestMatchesStaff(r.userId || r.staffId, staffKey, aliasMap)) continue;
    const start = localCalendarDateKey(r.startDate || r.fromDate || "");
    if (!start || Number(start.slice(0, 4)) !== year) continue;
    used += Number(r.days) > 0 ? Number(r.days) : leaveDaysBetween(r.startDate || r.fromDate, r.endDate || r.toDate);
  }

  let adj = 0;
  for (const row of options.adjustments || []) {
    if (Number(row?.calendarYear ?? row?.calendar_year) !== year) continue;
    const days = Number(row?.adjustmentDays ?? row?.adjustment_days ?? 0);
    if (!Number.isFinite(days) || days === 0) continue;
    const scope = String(row?.scope || "global")
      .trim()
      .toLowerCase();
    if (scope === "global") {
      adj += days;
      continue;
    }
    const target = String(row?.staffLoginId || row?.staff_login_id || "")
      .trim()
      .toLowerCase();
    if (target && target === staffKey) adj += days;
  }

  return Math.max(0, baseDays + adj - used);
}

export function staffDisplayName(users: StaffUser[], userId?: string | null) {
  const id = String(userId || "").trim();
  const hit = users.find((u) => String(u.id) === id);
  return hit?.name || id || "—";
}

export function leaveStatusBadgeVariant(status?: string | null) {
  const s = normalizeLeaveStatus(status);
  if (s === "Approved") return "success" as const;
  if (s === "Rejected") return "danger" as const;
  if (s === "Cancelled") return "muted" as const;
  return "warning" as const;
}
