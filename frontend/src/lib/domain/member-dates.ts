const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Local calendar YYYY-MM-DD (matches prod date-key behavior). */
export function isoDate(value?: string | Date | null) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayIso() {
  return isoDate(new Date());
}

export function addMonthsToDateKey(dateKey: string, months: number) {
  const key = isoDate(dateKey);
  if (!key) return "";
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setMonth(dt.getMonth() + months);
  return isoDate(dt);
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const key = isoDate(dateKey);
  if (!key) return "";
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return isoDate(dt);
}

export function nextPaymentDateFromBillingDate(billingDate?: string | null) {
  const billing = isoDate(billingDate);
  return billing ? addMonthsToDateKey(billing, 1) : "";
}

export function paymentByFromBillingDate(billingDate?: string | null) {
  const billing = isoDate(billingDate);
  return billing ? addDaysToDateKey(billing, 7) : "";
}

export function payMonthLabel(dateValue?: string | Date | null) {
  const key = isoDate(dateValue);
  if (!key) return "";
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]}-${y}`;
}

/** Prod joining-date rule: if join is today → billing today; else joining + 1 month. */
export function billingDateFromJoining(joiningDate?: string | null) {
  const join = isoDate(joiningDate);
  if (!join) return "";
  return join === todayIso() ? join : addMonthsToDateKey(join, 1);
}
