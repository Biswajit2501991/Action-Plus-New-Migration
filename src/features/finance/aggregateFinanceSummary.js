import { buildFinanceKpis, resolveMonthExpenseAndProfit } from './buildFinanceKpis.js';
import { buildMonthlyReconciliation } from './buildMonthlyReconciliation.js';
import { buildFinanceLedgerRows } from './buildFinanceLedger.js';
import { paymentCalendarDayKey, paymentInCalendarMonth } from './paymentCalendarMonth.js';
import { paymentInPaidMonth, resolvePaidMonthForPayment, validatePaidMonthKey } from './derivePaidMonth.js';
import { manualIncomeFinanceRows } from './financeRowFilters.js';

/**
 * Build minimal ledger payment rows from DB/API payment records.
 * @param {object[]} paymentRecords { paidAt, amount, memberId, memberName?, method?, id? }
 */
export function paymentRecordsToLedgerIncomeRows(paymentRecords) {
  return (Array.isArray(paymentRecords) ? paymentRecords : [])
    .map((p) => {
      const day = paymentCalendarDayKey(p.paidAt || p.receivedAt || p.date || p.ts);
      const amount = Number(p.amount || 0);
      if (!day || amount <= 0) return null;
      const paidMonth = resolvePaidMonthForPayment({
        paidMonth: p.paidMonth,
        billingDate: p.billingDate,
        billingMonth: p.billingMonth,
        paidAt: p.paidAt || p.receivedAt || p.date || p.ts,
      });
      return {
        id: p.id || `pay-${p.memberId}-${day}`,
        type: 'income',
        source: 'payment',
        memberId: p.memberId || '',
        memberName: p.memberName || '',
        date: day.length >= 10 ? day.slice(0, 10) : day,
        paidMonth,
        collectionMonth: day.slice(0, 7),
        plan: p.plan || '',
        method: p.method || '',
        amount,
        status: 'paid',
      };
    })
    .filter(Boolean);
}

/**
 * Aggregate collected revenue from raw payment rows (transaction date month).
 * @param {object[]} paymentRecords
 * @param {string} monthKey YYYY-MM
 */
export function sumCollectedFromPaymentRecords(paymentRecords, monthKey) {
  return (Array.isArray(paymentRecords) ? paymentRecords : [])
    .filter((p) => paymentInCalendarMonth(p.paidAt || p.receivedAt || p.date, monthKey))
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
}

/** Service/revenue by paid_month on payment rows. */
export function sumServiceRevenueFromPaymentRecords(paymentRecords, monthKey) {
  return (Array.isArray(paymentRecords) ? paymentRecords : [])
    .filter((p) => {
      const memberStatus = String(p.memberStatus || '').trim().toLowerCase();
      if (memberStatus && memberStatus !== 'active') return false;
      const paidMonth = validatePaidMonthKey(p.paidMonth)
        || validatePaidMonthKey(p.billingMonth);
      return paymentInPaidMonth(paidMonth, monthKey);
    })
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
}

/**
 * Server-side month summary from payments + manual finance rows (no pending billing).
 * @param {object} input
 * @param {object[]} input.paymentRecords
 * @param {object[]} input.financeTransactions manual store rows
 * @param {string} input.monthKey YYYY-MM
 * @param {object} [input.settings]
 * @param {boolean} [input.includeLines]
 */
export function aggregateFinanceMonthSummary(input) {
  const {
    paymentRecords = [],
    financeTransactions = [],
    monthKey,
    settings = {},
    includeLines = false,
  } = input;
  const key = String(monthKey || '').trim();

  const manualRowsSource = manualIncomeFinanceRows(financeTransactions);

  const manualIncome = manualRowsSource
    .filter((t) => paymentInCalendarMonth(t.date, key))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const memberPaymentsCollected = sumCollectedFromPaymentRecords(paymentRecords, key);
  const memberPaymentsService = sumServiceRevenueFromPaymentRecords(paymentRecords, key);

  const paymentRows = paymentRecordsToLedgerIncomeRows(
    (Array.isArray(paymentRecords) ? paymentRecords : []).filter((p) =>
      paymentInCalendarMonth(p.paidAt || p.receivedAt || p.date, key)),
  );
  const manualRows = manualRowsSource
    .filter((t) => paymentInCalendarMonth(t.date, key))
    .map((t) => ({
      id: t.id,
      type: 'income',
      source: t.source || 'manual',
      memberId: t.memberId || '',
      memberName: t.memberName || '',
      date: String(t.date || '').slice(0, 10),
      amount: Number(t.amount || 0),
      status: 'paid',
      category: t.category || '',
    }));

  const expenseLedgerRows = (Array.isArray(financeTransactions) ? financeTransactions : [])
    .filter((t) => t && t.type === 'expense' && paymentInCalendarMonth(t.date, key))
    .map((t) => ({
      type: 'expense',
      date: paymentCalendarDayKey(t.date) || String(t.date || '').slice(0, 10),
      amount: Number(t.amount || 0),
      status: 'posted',
      category: t.category || '',
    }));
  const collectedRevenue = memberPaymentsCollected + manualIncome;
  const serviceRevenue = memberPaymentsService + manualIncome;
  const expenseProfit = resolveMonthExpenseAndProfit(
    expenseLedgerRows,
    collectedRevenue,
    settings?.financeUseEstimatedExpense !== false,
  );

  const paymentCount = (Array.isArray(paymentRecords) ? paymentRecords : [])
    .filter((p) => paymentInCalendarMonth(p.paidAt || p.receivedAt || p.date, key)).length;
  const servicePaymentCount = (Array.isArray(paymentRecords) ? paymentRecords : [])
    .filter((p) => {
      const memberStatus = String(p.memberStatus || '').trim().toLowerCase();
      if (memberStatus && memberStatus !== 'active') return false;
      const paidMonth = validatePaidMonthKey(p.paidMonth)
        || validatePaidMonthKey(p.billingMonth);
      return paymentInPaidMonth(paidMonth, key);
    }).length;

  const out = {
    monthKey: key,
    dateBasis: 'payment_transaction_date_utc_calendar',
    revenueBasis: 'paid_month_billing_cycle',
    memberPaymentsCollected,
    memberPaymentsService,
    manualIncomeCollected: manualIncome,
    collectedRevenue,
    serviceRevenue,
    paymentCount,
    servicePaymentCount,
    manualIncomeCount: manualRows.length,
    expenses: expenseProfit.expense,
    actualExpenses: expenseProfit.actualExpense,
    profit: expenseProfit.profit,
    expenseSubtitle: expenseProfit.expenseSubtitle,
    useEstimateFallback: expenseProfit.useEstimateFallback,
  };

  if (includeLines) {
    out.paymentLines = paymentRecords
      .filter((p) => paymentInCalendarMonth(p.paidAt || p.receivedAt || p.date, key))
      .map((p) => ({
        id: p.id,
        memberId: p.memberId,
        memberName: p.memberName,
        paidAt: p.paidAt || p.receivedAt || p.date,
        paidMonth: resolvePaidMonthForPayment({
          paidMonth: p.paidMonth,
          billingDate: p.billingDate,
          billingMonth: p.billingMonth,
          paidAt: p.paidAt || p.receivedAt || p.date,
        }),
        amount: Number(p.amount || 0),
        method: p.method || '',
      }));
    out.servicePaymentLines = paymentRecords
      .filter((p) => {
        const paidMonth = resolvePaidMonthForPayment({
          paidMonth: p.paidMonth,
          billingDate: p.billingDate,
          billingMonth: p.billingMonth,
          paidAt: p.paidAt || p.receivedAt || p.date,
        });
        return paymentInPaidMonth(paidMonth, key);
      })
      .map((p) => ({
        id: p.id,
        memberId: p.memberId,
        memberName: p.memberName,
        paidAt: p.paidAt || p.receivedAt || p.date,
        paidMonth: resolvePaidMonthForPayment({
          paidMonth: p.paidMonth,
          billingDate: p.billingDate,
          billingMonth: p.billingMonth,
          paidAt: p.paidAt || p.receivedAt || p.date,
        }),
        amount: Number(p.amount || 0),
        method: p.method || '',
      }));
    out.manualIncomeLines = manualRows;
  }

  return out;
}

/**
 * Full-ledger KPIs when members + financeTransactions are available (client parity).
 */
export function aggregateFinanceSummaryFromMembers(members, financeTransactions, monthKey, settings, deps) {
  const ledger = buildFinanceLedgerRows(members, financeTransactions, deps);
  const kpis = buildFinanceKpis(ledger, monthKey, settings);
  return {
    monthKey,
    dateBasis: 'client_ledger',
    revenueBasis: 'paid_month_billing_cycle',
    collectedRevenue: kpis.collectedRevenue,
    serviceRevenue: kpis.serviceRevenue,
    pendingBilled: kpis.pendingBilled,
    paymentCount: kpis.incomeRowsCollected.filter((r) => r.source === 'payment').length,
    servicePaymentCount: kpis.incomeRowsService.filter((r) => r.source === 'payment').length,
    expenses: kpis.expense,
    profit: kpis.profit,
    ledgerRowCount: ledger.length,
  };
}

/**
 * @param {object[]} paymentRecords all payments (any month)
 * @param {object[]} financeTransactions
 * @param {number} year
 * @param {object} settings
 */
export function aggregateYearReconciliation(paymentRecords, financeTransactions, year, settings) {
  const manualAsLedger = (Array.isArray(financeTransactions) ? financeTransactions : []);
  const paymentLedger = paymentRecordsToLedgerIncomeRows(paymentRecords);
  const expenseLedger = manualAsLedger
    .filter((t) => t.type === 'expense')
    .map((t) => ({
      type: 'expense',
      date: String(t.date || '').slice(0, 10),
      amount: Number(t.amount || 0),
      status: 'posted',
      category: t.category || '',
    }));
  const transactions = [
    ...paymentLedger,
    ...manualAsLedger.filter((t) => t.type !== 'expense').map((t) => ({
      type: 'income',
      source: 'manual',
      date: String(t.date || '').slice(0, 10),
      amount: Number(t.amount || 0),
      status: 'paid',
    })),
    ...expenseLedger,
  ];
  return buildMonthlyReconciliation(transactions, year, {
    useEstimatedExpense: settings?.financeUseEstimatedExpense !== false,
  });
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Year reconciliation using the same collected-revenue basis as GET /finance/summary?month=.
 * Payment sum by paid_at calendar month + manual income (mirrors excluded) + expense estimate.
 * @param {object[]} paymentRecords collected payments (any month in year)
 * @param {object[]} financeTransactions
 * @param {number|string} year
 * @param {object} settings
 * @param {{ monthLabels?: string[] }} [options]
 */
export function buildYearCollectedReconciliationFromPayments(
  paymentRecords,
  financeTransactions,
  year,
  settings,
  options = {},
) {
  const y = Number(year);
  if (!y) return [];
  const labels = Array.isArray(options.monthLabels) ? options.monthLabels : [];
  const useEstimatedExpense = settings?.financeUseEstimatedExpense !== false;
  const manualRows = manualIncomeFinanceRows(financeTransactions);
  const financeRows = Array.isArray(financeTransactions) ? financeTransactions : [];
  const rows = [];
  for (let m = 1; m <= 12; m += 1) {
    const monthKey = `${y}-${pad2(m)}`;
    const paymentSum = sumCollectedFromPaymentRecords(paymentRecords, monthKey);
    const manualIncome = manualRows
      .filter((t) => paymentInCalendarMonth(t.date, monthKey))
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const collectedFromLedger = paymentSum + manualIncome;
    const expenseLedgerRows = financeRows
      .filter((t) => t && t.type === 'expense' && paymentInCalendarMonth(t.date, monthKey))
      .map((t) => ({
        type: 'expense',
        date: String(t.date || '').slice(0, 10),
        amount: Number(t.amount || 0),
        status: 'posted',
        category: t.category || '',
      }));
    const expenseProfit = resolveMonthExpenseAndProfit(
      expenseLedgerRows,
      collectedFromLedger,
      useEstimatedExpense,
    );
    rows.push({
      monthKey,
      label: labels[m - 1] ? `${labels[m - 1]} ${y}` : monthKey,
      incomeCollected: collectedFromLedger,
      expenses: expenseProfit.expense,
      actualExpenses: expenseProfit.actualExpense,
      profit: expenseProfit.profit,
    });
  }
  return rows;
}

/** Compare server payment sum vs client collected KPI. */
export function financeSummaryDelta(serverCollected, clientCollected) {
  const server = Number(serverCollected || 0);
  const client = Number(clientCollected || 0);
  const delta = client - server;
  return {
    serverCollected: server,
    clientCollected: client,
    delta,
    matches: Math.abs(delta) < 0.01,
  };
}
