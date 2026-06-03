/**
 * Assemble the Finance ledger: recorded payments + manual rows.
 * Billing pending placeholders are opt-in only (collections view).
 */

import {
  buildBillingPendingLedgerRows,
  buildPaymentIncomeLedgerRows,
  mapManualFinanceLedgerRows,
} from './financeLedger.js';

/**
 * @param {object[]} members
 * @param {object[]} financeTransactions
 * @param {object} deps
 * @param {(member: object) => object[]} deps.normalizeMemberPaymentHistory
 * @param {(value: unknown) => string} deps.calendarDateKey
 * @param {(member: object) => Date|null} [deps.retentionPaymentDeadline]
 * @param {Date} [deps.today]
 * @param {boolean} [deps.includePendingBilling=false] synthetic overdue billing rows
 */
export function buildFinanceLedgerRows(members, financeTransactions, deps = {}) {
  const {
    normalizeMemberPaymentHistory,
    calendarDateKey,
    retentionPaymentDeadline,
    today = new Date(),
    includePendingBilling = false,
  } = deps;
  const payment = buildPaymentIncomeLedgerRows(
    members,
    normalizeMemberPaymentHistory,
    calendarDateKey,
  );
  const pending = includePendingBilling
    ? buildBillingPendingLedgerRows(members, {
      retentionPaymentDeadline,
      calendarDateKey,
      today,
    })
    : [];
  const manual = mapManualFinanceLedgerRows(financeTransactions).map((t) => ({
    ...t,
    date: (typeof calendarDateKey === 'function' ? calendarDateKey(t.date) : t.date) || t.date,
  }));
  return [...payment, ...pending, ...manual]
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}
