import { toCalendarDateKey } from '../members/reminderBillingCycle.js';

/** YYYY-MM revenue month from payment / transaction date (local calendar). */
export function paymentMonthKeyFromValue(value) {
  const day = toCalendarDateKey(value);
  return day ? day.slice(0, 7) : '';
}

/** First day of month for display-only billingDate on payment rows. */
export function billingDateFromPaymentMonth(monthKey) {
  const key = String(monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(key)) return '';
  return `${key}-01`;
}
