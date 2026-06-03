/**
 * Calendar month for payment_transaction_date — matches frontend iso() / asUTC day keys.
 */

/** YYYY-MM-DD in UTC calendar (same basis as index.html iso()). */
export function paymentCalendarDayKey(value) {
  if (value === null || value === undefined || value === '') return '';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = /^\d{4}-\d{2}-\d{2}T/.test(s) ? new Date(s) : (value instanceof Date ? value : new Date(value));
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** @param {string} monthKey YYYY-MM */
export function paymentInCalendarMonth(paidAt, monthKey) {
  const key = String(monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(key)) return false;
  const day = paymentCalendarDayKey(paidAt);
  return Boolean(day && day.slice(0, 7) === key);
}

/**
 * Inclusive calendar bounds for SQL paid_at filtering (UTC midnight window).
 * @param {string} monthKey YYYY-MM
 */
export function calendarMonthPaidAtBounds(monthKey) {
  const key = String(monthKey || '').trim();
  const m = key.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const from = `${key}-01T00:00:00.000Z`;
  let nextY = year;
  let nextM = month + 1;
  if (nextM > 12) {
    nextM = 1;
    nextY += 1;
  }
  const toExclusive = `${nextY}-${String(nextM).padStart(2, '0')}-01T00:00:00.000Z`;
  return { monthKey: key, from, toExclusive };
}
