import { toCalendarDateKey } from '../members/reminderBillingCycle.js';
import { paymentMonthKeyFromValue } from './paymentMonthKey.js';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** YYYY-MM service/revenue month from billing date before payment (cycle cleared). */
export function derivePaidMonthFromBilling(billingDateBefore) {
  const day = toCalendarDateKey(billingDateBefore);
  return day ? day.slice(0, 7) : '';
}

/** Normalize and validate YYYY-MM; returns '' when invalid. */
export function validatePaidMonthKey(value) {
  const key = String(value || '').trim();
  if (!/^\d{4}-\d{2}$/.test(key)) return '';
  const month = Number(key.slice(5, 7));
  if (month < 1 || month > 12) return '';
  return key;
}

/**
 * Resolve paid_month for a payment row — manual override wins, then billing-before, then legacy fallbacks.
 * @param {object} input
 * @param {string} [input.paidMonth]
 * @param {string} [input.billingDateBefore]
 * @param {string} [input.billingDate]
 * @param {string} [input.billingMonth]
 * @param {string} [input.paidAt]
 */
export function resolvePaidMonthForPayment(input = {}) {
  const manual = validatePaidMonthKey(input.paidMonth);
  if (manual) return manual;
  const fromBilling = derivePaidMonthFromBilling(
    input.billingDateBefore || input.billingDate,
  );
  if (fromBilling) return fromBilling;
  const fromBillingMonth = validatePaidMonthKey(input.billingMonth);
  if (fromBillingMonth) return fromBillingMonth;
  return paymentMonthKeyFromValue(input.paidAt || input.receivedAt || input.date || input.ts);
}

/** True when payment row belongs to service/revenue month key. */
export function paymentInPaidMonth(paidMonth, monthKey) {
  const pm = validatePaidMonthKey(paidMonth);
  const mk = validatePaidMonthKey(monthKey);
  return Boolean(pm && mk && pm === mk);
}

/** Parse member pay_month / payMonth field to YYYY-MM (supports legacy Mon-YYYY labels). */
export function payMonthKeyFromStoredValue(value) {
  const direct = validatePaidMonthKey(value);
  if (direct) return direct;
  const raw = String(value || '').trim();
  const legacy = raw.match(/^([A-Za-z]+)-(\d{4})$/);
  if (!legacy) return '';
  const name = legacy[1].toLowerCase();
  let idx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === name);
  if (idx < 0) {
    idx = MONTH_ABBR.findIndex((m) => m.toLowerCase() === name.slice(0, 3));
  }
  if (idx < 0) return '';
  return `${legacy[2]}-${String(idx + 1).padStart(2, '0')}`;
}

/** Human label for month picker / membership display. */
export function formatPaidMonthDisplay(value) {
  const key = payMonthKeyFromStoredValue(value);
  if (!key) return String(value || '').trim() || '—';
  const y = Number(key.slice(0, 4));
  const idx = Number(key.slice(5, 7)) - 1;
  const mon = MONTH_NAMES[idx] || key.slice(5, 7);
  return `${mon} ${y}`;
}
