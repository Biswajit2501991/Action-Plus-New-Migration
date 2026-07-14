/** Calendar date helpers aligned with production `index.html` billing/overdue rules. */

export function localCalendarDateKey(value?: string | Date | null): string {
  if (!value) return "";
  if (typeof value === "string") {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
    if (m) return m[1];
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

export function localTodayCalendarKey(): string {
  return localCalendarDateKey(new Date());
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const key = localCalendarDateKey(dateKey);
  if (!key) return "";
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + Number(days || 0));
  return localCalendarDateKey(dt);
}

/** Production rule: Payment By = Billing Date + 7 days. */
export function paymentByDateKey(member: {
  billingDate?: string | null;
  paymentBy?: string | null;
}): string {
  const billingKey = localCalendarDateKey(member?.billingDate || "");
  if (billingKey) return addDaysToDateKey(billingKey, 7);
  const stored = localCalendarDateKey(member?.paymentBy || "");
  if (stored) return stored;
  return billingKey;
}

export function isPaymentByPastDue(
  member: { status?: string | null; billingDate?: string | null; paymentBy?: string | null },
  opts: { activeOnly?: boolean; asOfKey?: string | null } = {},
): boolean {
  if (!member) return false;
  const activeOnly = opts.activeOnly !== false;
  if (activeOnly && member.status !== "Active") return false;
  const deadlineKey = paymentByDateKey(member);
  const todayKey = opts.asOfKey && /^\d{4}-\d{2}-\d{2}$/.test(opts.asOfKey)
    ? opts.asOfKey
    : localTodayCalendarKey();
  return Boolean(deadlineKey && todayKey && deadlineKey < todayKey);
}

export function overdueDaysForMember(
  member: { billingDate?: string | null; paymentBy?: string | null },
  asOfKey?: string | null,
): number {
  const deadlineKey = paymentByDateKey(member);
  const todayKey =
    asOfKey && /^\d{4}-\d{2}-\d{2}$/.test(asOfKey) ? asOfKey : localTodayCalendarKey();
  if (!deadlineKey || !todayKey || deadlineKey >= todayKey) return 0;
  const a = new Date(deadlineKey + "T00:00:00");
  const b = new Date(todayKey + "T00:00:00");
  return Math.max(1, Math.floor((b.getTime() - a.getTime()) / 86400000));
}

function calendarParts(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m, d };
}

/** Whole months between two calendar dates (UTC), floored by day-of-month. */
export function monthsBetweenCalendarDates(
  fromDate?: string | Date | null,
  toDate: string | Date = new Date(),
): number {
  const fromKey = localCalendarDateKey(fromDate || "");
  const toKey = localCalendarDateKey(toDate);
  if (!fromKey || !toKey) return 0;
  const from = calendarParts(fromKey);
  const to = calendarParts(toKey);
  let months = (to.y - from.y) * 12 + (to.m - from.m);
  if (to.d < from.d) months -= 1;
  return Math.max(0, months);
}

export function daysBetweenCalendarDates(
  fromDate?: string | Date | null,
  toDate: string | Date = new Date(),
): number {
  const fromKey = localCalendarDateKey(fromDate || "");
  const toKey = localCalendarDateKey(toDate);
  if (!fromKey || !toKey) return 0;
  const a = new Date(fromKey + "T00:00:00");
  const b = new Date(toKey + "T00:00:00");
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86400000));
}

export function isHoldOrDeactivated(status?: string | null): boolean {
  const s = String(status || "")
    .trim()
    .toLowerCase();
  return s === "hold" || s === "deactivated";
}

/**
 * Elapsed inactive time from billing date for Hold / Deactivated members.
 * Uses days when under 1 month, months when under 1 year, otherwise years.
 */
export function inactiveDurationLabel(
  member: { status?: string | null; billingDate?: string | null },
  asOf: string | Date = new Date(),
): string {
  if (!isHoldOrDeactivated(member?.status)) return "";
  const from = member?.billingDate;
  if (!localCalendarDateKey(from || "")) return "";

  const months = monthsBetweenCalendarDates(from, asOf);
  if (months >= 12) {
    const years = Math.floor(months / 12);
    return `${years} Year${years === 1 ? "" : "s"}`;
  }
  if (months >= 1) {
    return `${months} Month${months === 1 ? "" : "s"}`;
  }
  const days = daysBetweenCalendarDates(from, asOf);
  return `${days} Day${days === 1 ? "" : "s"}`;
}

/** Payment By cell: date always; duration under it for Hold / Deactivated. */
export function paymentByColumnValue(member: {
  status?: string | null;
  billingDate?: string | null;
  paymentBy?: string | null;
}): string {
  return paymentByDateKey(member) || member.billingDate || "";
}
