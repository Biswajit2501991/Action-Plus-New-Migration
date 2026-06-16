/**
 * Collected-income drilldown rows from GET /finance/summary?includeLines=1.
 */

import { paymentInCalendarMonth } from './paymentCalendarMonth.js';
import { resolvePaidMonthForPayment } from './derivePaidMonth.js';

/**
 * Payment lines for collected revenue (payment_transaction_date only — not service month merge).
 * @param {object[]} paymentRecords
 * @param {string} monthKey YYYY-MM
 */
export function buildCollectedPaymentLines(paymentRecords, monthKey) {
  const key = String(monthKey || '').trim();
  return (Array.isArray(paymentRecords) ? paymentRecords : [])
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
}

/**
 * @param {object} line API payment or manual income line
 * @param {'payment'|'manual'} kind
 */
function summaryLineToLedgerRow(line, kind) {
  const paidAt = kind === 'payment'
    ? (line.paidAt || line.receivedAt || line.date || '')
    : (line.date || '');
  const date = String(paidAt || '').slice(0, 10);
  return {
    id: String(line.id || `${kind}-${date}-${line.memberId || 'manual'}`),
    type: 'income',
    source: kind === 'payment' ? 'payment' : (line.source || 'manual'),
    memberId: String(line.memberId || ''),
    memberName: String(line.memberName || (kind === 'manual' ? 'Manual income' : '')),
    date,
    plan: String(line.plan || line.category || ''),
    method: String(line.method || ''),
    amount: Number(line.amount || 0),
    status: 'paid',
  };
}

/**
 * Build View Income drilldown rows (sorted, classified, running total) from API summary body.
 * @param {object} summaryBody response from /finance/summary?includeLines=1
 * @param {object} [deps]
 * @param {(row: object, ctx: object) => string} [deps.classifyRevenueBucket]
 * @param {Set<string>} [deps.ptClientMemberIds]
 * @param {(id: string) => object|undefined} [deps.memberById]
 */
export function buildDrilldownRowsFromFinanceSummary(summaryBody, deps = {}) {
  const paymentLines = Array.isArray(summaryBody?.paymentLines) ? summaryBody.paymentLines : [];
  const manualLines = Array.isArray(summaryBody?.manualIncomeLines) ? summaryBody.manualIncomeLines : [];
  const classifyFn = deps.classifyRevenueBucket;
  const ptIds = deps.ptClientMemberIds instanceof Set ? deps.ptClientMemberIds : new Set();
  const memberById = typeof deps.memberById === 'function' ? deps.memberById : () => undefined;
  const ctx = { ptClientMemberIds: ptIds, memberById };

  const rows = [
    ...paymentLines.map((p) => summaryLineToLedgerRow(p, 'payment')),
    ...manualLines.map((m) => summaryLineToLedgerRow(m, 'manual')),
  ].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

  let running = 0;
  return rows.map((r) => {
    running += Number(r.amount || 0);
    const bucket = typeof classifyFn === 'function' ? classifyFn(r, ctx) : 'other';
    const typeLabel = bucket === 'pt' ? 'PT' : (bucket === 'membership' ? 'Membership' : 'Other');
    return { ...r, runningTotal: running, typeLabel };
  });
}

/** Sum of drilldown row amounts (should match summary.collectedRevenue). */
export function sumDrilldownRowAmounts(rows) {
  return (Array.isArray(rows) ? rows : []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
}
