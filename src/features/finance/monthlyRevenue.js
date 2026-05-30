import { toCalendarDateKey } from '../members/reminderBillingCycle.js';

/** Sum collected revenue entries whose received date falls in YYYY-MM (local calendar). */
export function sumMonthlyCollectedRevenue(entries, monthKey) {
  const key = String(monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(key)) return 0;
  return (Array.isArray(entries) ? entries : [])
    .filter((r) => String(toCalendarDateKey(r?.receivedAt) || '').slice(0, 7) === key)
    .reduce((sum, r) => sum + Number(r?.amount || 0), 0);
}
