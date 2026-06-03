/**
 * Finance KPI totals from the Transactions ledger (single source of truth).
 */

/**
 * @param {object[]} rows ledger rows
 * @param {object} [options]
 * @param {boolean} [options.incomeOnly=true]
 * @param {string} [options.status] e.g. 'pending' | 'paid'
 * @param {string} [options.excludeStatus] e.g. 'pending' — omit rows with this status
 */
export function sumLedgerRowAmounts(rows, options = {}) {
  const { incomeOnly = true, status = '', excludeStatus = '' } = options;
  const wantStatus = String(status || '').trim().toLowerCase();
  const omitStatus = String(excludeStatus || '').trim().toLowerCase();
  return (Array.isArray(rows) ? rows : [])
    .filter((t) => {
      if (!t || typeof t !== 'object') return false;
      if (incomeOnly && t.type === 'expense') return false;
      const rowStatus = String(t.status || '').toLowerCase();
      if (wantStatus && rowStatus !== wantStatus) return false;
      if (omitStatus && rowStatus === omitStatus) return false;
      return true;
    })
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
}

/**
 * @param {object[]} rows
 * @param {string} from YYYY-MM-DD inclusive
 * @param {string} to YYYY-MM-DD inclusive
 */
export function filterLedgerRowsByDateRange(rows, from, to) {
  const fromKey = String(from || '').trim();
  const toKey = String(to || '').trim();
  return (Array.isArray(rows) ? rows : []).filter((t) => {
    const d = String(t?.date || '').trim();
    if (!d) return false;
    if (fromKey && d < fromKey) return false;
    if (toKey && d > toKey) return false;
    return true;
  });
}

/**
 * Sum income ledger rows whose date falls in YYYY-MM (local date string compare on YYYY-MM-DD).
 * @param {object[]} rows full ledger (not pre-filtered by month)
 * @param {string} monthKey YYYY-MM
 * @param {object} [options]
 * @param {string} [options.status]
 * @param {string} [options.excludeStatus]
 */
export function sumLedgerIncomeForMonthKey(rows, monthKey, options = {}) {
  const key = String(monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(key)) return 0;
  const wantStatus = String(options.status || '').trim().toLowerCase();
  const omitStatus = String(options.excludeStatus || '').trim().toLowerCase();
  return (Array.isArray(rows) ? rows : [])
    .filter((t) => {
      if (!t || t.type === 'expense') return false;
      const d = String(t.date || '').trim();
      if (d.slice(0, 7) !== key) return false;
      const rowStatus = String(t.status || '').toLowerCase();
      if (wantStatus && rowStatus !== wantStatus) return false;
      if (omitStatus && rowStatus === omitStatus) return false;
      return true;
    })
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
}

/** Collected income for a month (excludes billing-pending). Uses transaction `date` (paidAt). */
export function sumCollectedIncomeForMonthKey(rows, monthKey) {
  return sumLedgerIncomeForMonthKey(rows, monthKey, { excludeStatus: 'pending' });
}

/**
 * Service/revenue income for a month by paidMonth (billing cycle cleared).
 * Manual income rows without paidMonth fall back to transaction date month.
 * @param {object[]} rows full ledger
 * @param {string} monthKey YYYY-MM
 */
export function sumServiceRevenueForPaidMonthKey(rows, monthKey) {
  const key = String(monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(key)) return 0;
  return (Array.isArray(rows) ? rows : [])
    .filter((t) => {
      if (!t || t.type === 'expense') return false;
      if (String(t.status || '').toLowerCase() === 'pending') return false;
      const memberStatus = String(t.memberStatus || '').trim().toLowerCase();
      if (memberStatus && memberStatus !== 'active') return false;
      const revenueMonth = String(t.paidMonth || '').trim().slice(0, 7);
      return revenueMonth === key;
    })
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
}
