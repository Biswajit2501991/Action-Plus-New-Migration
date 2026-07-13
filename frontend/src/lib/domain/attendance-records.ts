import type { AttendanceRecord, LeaveRequest } from "@/types";
import { localCalendarDateKey, localTodayCalendarKey } from "@/lib/domain/billing";

export function attendanceRecordKey(date?: string | null, userId?: string | null) {
  return `${localCalendarDateKey(date || "")}__${String(userId || "").trim()}`;
}

export function mergeAttendanceRecords(
  existing: AttendanceRecord[],
  incoming: AttendanceRecord[],
): AttendanceRecord[] {
  const map = new Map<string, AttendanceRecord>();
  for (const row of existing || []) {
    const key = attendanceRecordKey(row.date, row.userId || row.staffId);
    if (key.startsWith("__") || key.endsWith("__")) continue;
    map.set(key, row);
  }
  for (const row of incoming || []) {
    const key = attendanceRecordKey(row.date, row.userId || row.staffId);
    if (key.startsWith("__") || key.endsWith("__")) continue;
    map.set(key, { ...(map.get(key) || {}), ...row });
  }
  return [...map.values()].sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || "")),
  );
}

export function defaultAttendanceRange(isOwner: boolean) {
  const end = localTodayCalendarKey();
  const start = new Date();
  if (isOwner) start.setFullYear(start.getFullYear() - 5);
  else start.setMonth(start.getMonth() - 3);
  return {
    startDate: localCalendarDateKey(start),
    endDate: end,
  };
}

export function notesDefaultRange() {
  const end = localTodayCalendarKey();
  const start = new Date();
  start.setMonth(start.getMonth() - 2);
  return {
    startDate: localCalendarDateKey(start),
    endDate: end,
  };
}

function isoDate(val?: string | Date | null) {
  return localCalendarDateKey(val || "");
}

function dateRangeList(startIso: string, endIso: string) {
  const startKey = isoDate(startIso);
  const endKey = isoDate(endIso);
  if (!startKey || !endKey || startKey > endKey) return [] as string[];
  const out: string[] = [];
  const [sy, sm, sd] = startKey.split("-").map(Number);
  const [ey, em, ed] = endKey.split("-").map(Number);
  const cursor = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  while (cursor <= end) {
    out.push(localCalendarDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** Mark attendance rows as Leave for an approved request (prod parity). */
export function mergeApprovedLeaveIntoAttendance(
  existing: AttendanceRecord[],
  request: LeaveRequest | null | undefined,
  actor = "",
): AttendanceRecord[] {
  const userId = String(request?.userId || request?.staffId || "").trim();
  const startDate = String(request?.startDate || request?.fromDate || "").slice(0, 10);
  const endDate = String(request?.endDate || request?.toDate || "").slice(0, 10);
  if (!request || !userId || !startDate || !endDate) {
    return Array.isArray(existing) ? existing : [];
  }
  const days = dateRangeList(startDate, endDate);
  if (!days.length) return Array.isArray(existing) ? existing : [];
  const base = Array.isArray(existing) ? existing : [];
  const nowIso = new Date().toISOString();
  const noteText = `Leave approved (${request.type || "Leave"})`;
  const keySet = new Set(days.map((d) => `${d}__${userId}`));
  const touched = new Set<string>();
  const next = base.map((row) => {
    const rowDate = isoDate(row.date);
    const key = `${rowDate}__${row.userId || row.staffId}`;
    if (!keySet.has(key)) return row;
    touched.add(key);
    return {
      ...row,
      status: "Leave",
      leaveRequestId: request.id,
      leaveAutoSynced: true,
      note: row.note || row.notes ? `${row.note || row.notes} | ${noteText}` : noteText,
      updatedAt: nowIso,
      updatedBy: actor,
    };
  });
  days.forEach((dayIso) => {
    const key = `${dayIso}__${userId}`;
    if (touched.has(key)) return;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `att-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    next.unshift({
      id,
      date: dayIso,
      userId,
      status: "Leave",
      checkIn: "",
      checkOut: "",
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

export function statusTone(status?: string | null) {
  const s = String(status || "Absent");
  if (s === "Present") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (s === "Leave") return "border-violet-200 bg-violet-50 text-violet-800";
  if (s === "Half Day") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-100 text-slate-600";
}
