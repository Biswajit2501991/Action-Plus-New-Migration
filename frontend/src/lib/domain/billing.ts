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
