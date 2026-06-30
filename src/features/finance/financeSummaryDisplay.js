/**
 * Display-layer helpers — backend summary API is SSOT for cards in backend mode.
 */

/** Normalize month summary API payload for KPI cards. */
export function monthFinanceDisplayFromSummary(serverSummary, fallbackKpis = null) {
  if (serverSummary && typeof serverSummary === 'object') {
    const actualExpenses = Number(serverSummary.actualExpenses ?? 0);
    return {
      collectedRevenue: Number(serverSummary.collectedRevenue ?? 0),
      serviceRevenue: Number(serverSummary.serviceRevenue ?? 0),
      expense: Number(serverSummary.expenses ?? 0),
      actualExpenses,
      profit: Number(serverSummary.profit ?? 0),
      expenseSubtitle: String(serverSummary.expenseSubtitle ?? ''),
      hasExpenseRows: actualExpenses > 0,
      revenueGrowthPct: Number(serverSummary.revenueGrowthPct ?? 0),
      useEstimateFallback: Boolean(serverSummary.useEstimateFallback),
    };
  }
  if (fallbackKpis && typeof fallbackKpis === 'object') {
    return {
      collectedRevenue: Number(fallbackKpis.collectedRevenue ?? 0),
      serviceRevenue: Number(fallbackKpis.serviceRevenue ?? 0),
      expense: Number(fallbackKpis.expense ?? 0),
      actualExpenses: Number(fallbackKpis.actualExpense ?? 0),
      profit: Number(fallbackKpis.profit ?? 0),
      expenseSubtitle: String(fallbackKpis.expenseSubtitle ?? ''),
      hasExpenseRows: Boolean(fallbackKpis.hasExpenseRows),
      revenueGrowthPct: Number(fallbackKpis.revenueGrowthPct ?? 0),
      useEstimateFallback: Boolean(fallbackKpis.useEstimateFallback),
    };
  }
  return {
    collectedRevenue: 0,
    serviceRevenue: 0,
    expense: 0,
    actualExpenses: 0,
    profit: 0,
    expenseSubtitle: '',
    hasExpenseRows: false,
    revenueGrowthPct: 0,
    useEstimateFallback: false,
  };
}

/** Sum profit Jan..throughMonth from year reconciliation API rows. */
export function ytdProfitFromYearMonths(yearMonths, throughMonthKey) {
  const through = String(throughMonthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(through)) return 0;
  return (Array.isArray(yearMonths) ? yearMonths : [])
    .filter((row) => {
      const mk = String(row?.monthKey || '').trim();
      return mk && mk <= through;
    })
    .reduce((sum, row) => sum + Number(row.profit ?? 0), 0);
}

/** Sum collected income Jan..throughMonth from year reconciliation API rows. */
export function ytdCollectedFromYearMonths(yearMonths, throughMonthKey) {
  const through = String(throughMonthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(through)) return 0;
  return (Array.isArray(yearMonths) ? yearMonths : [])
    .filter((row) => {
      const mk = String(row?.monthKey || '').trim();
      return mk && mk <= through;
    })
    .reduce((sum, row) => sum + Number(row.incomeCollected ?? row.collectedRevenue ?? 0), 0);
}
