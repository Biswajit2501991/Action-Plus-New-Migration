/**
 * Compare expected service-month revenue (ledger) vs displayed totals per month.
 * @param {object[]} months - { monthKey, expected, actual }
 */
export function buildRevenueReconciliation(months) {
  const rows = (Array.isArray(months) ? months : []).map((row) => {
    const monthKey = String(row?.monthKey || '').trim();
    const expected = Number(row?.expected ?? row?.expectedRevenue ?? 0);
    const actual = Number(row?.actual ?? row?.displayedRevenue ?? 0);
    const delta = Math.round((actual - expected) * 100) / 100;
    return {
      monthKey,
      expected,
      actual,
      delta,
      status: delta === 0 ? 'ok' : (Math.abs(delta) < 0.01 ? 'ok' : 'mismatch'),
    };
  });
  const mismatches = rows.filter((r) => r.status === 'mismatch');
  return {
    rows,
    mismatchCount: mismatches.length,
    ok: mismatches.length === 0,
  };
}
