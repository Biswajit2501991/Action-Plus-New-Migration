/**
 * How far back GET /members?view=list includes payment_history rows.
 * Older paid_at rows are still in Supabase but omitted from list hydrate (egress cap).
 */

const DEFAULT_MONTHS = 84;
const MAX_MONTHS = 600;

export function paymentHistoryListMonthsBack() {
  const raw = Number(process.env.APG_PAYMENT_HISTORY_LIST_MONTHS_BACK);
  if (Number.isFinite(raw) && raw > 0 && raw <= MAX_MONTHS) {
    return Math.floor(raw);
  }
  return DEFAULT_MONTHS;
}

/** @param {Date} [now] */
export function paymentHistoryListSinceIso(now = new Date()) {
  const monthsBack = paymentHistoryListMonthsBack();
  const since = new Date(now.getTime());
  since.setUTCMonth(since.getUTCMonth() - monthsBack);
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);
  return since.toISOString();
}
