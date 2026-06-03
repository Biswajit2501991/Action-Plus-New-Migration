/**
 * Finance KPI totals from the Transactions ledger (single source of truth).
 */

/**
 * @param {object[]} rows ledger rows
 * @param {object} [options]
 * @param {boolean} [options.incomeOnly=true]
 * @param {string} [options.status] e.g. 'pending' | 'paid'
 */
export function sumLedgerRowAmounts(rows, options = {}) {
  const { incomeOnly = true, status = '' } = options;
  const wantStatus = String(status || '').trim().toLowerCase();
  return (Array.isArray(rows) ? rows : [])
    .filter((t) => {
      if (!t || typeof t !== 'object') return false;
      if (incomeOnly && t.type === 'expense') return false;
      if (wantStatus && String(t.status || '').toLowerCase() !== wantStatus) return false;
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
 */
export function sumLedgerIncomeForMonthKey(rows, monthKey) {
  const key = String(monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(key)) return 0;
  return (Array.isArray(rows) ? rows : [])
    .filter((t) => {
      if (!t || t.type === 'expense') return false;
      const d = String(t.date || '').trim();
      return d.slice(0, 7) === key;
    })
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
}
