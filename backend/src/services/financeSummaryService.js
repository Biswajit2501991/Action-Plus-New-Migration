import {
  aggregateFinanceMonthSummary,
  aggregateYearReconciliation,
} from '../../../src/features/finance/aggregateFinanceSummary.js';
import { calendarMonthPaidAtBounds, paymentInCalendarMonth } from '../../../src/features/finance/paymentCalendarMonth.js';

export { calendarMonthPaidAtBounds, paymentInCalendarMonth };

/**
 * @param {object[]} paymentRows from DB
 * @param {Map<string, { member_code: string, name?: string }>} memberPkToMeta
 */
export function mapDbPaymentsToRecords(paymentRows, memberPkToMeta) {
  return (Array.isArray(paymentRows) ? paymentRows : []).map((row) => {
    const meta = memberPkToMeta.get(row.member_id) || {};
    return {
      id: row.external_payment_id || String(row.id),
      memberId: meta.member_code || '',
      memberName: meta.name || '',
      paidAt: row.paid_at,
      paidMonth: row.paid_month || '',
      billingDate: row.billing_date || '',
      billingMonth: row.billing_month || '',
      amount: Number(row.amount || 0),
      method: row.method || '',
      plan: '',
    };
  });
}

/**
 * @param {object[]} financeRows financeRowToApp shape
 * @param {string} monthKey
 * @param {object} settings
 * @param {boolean} includeLines
 */
export function buildMonthSummaryFromRecords(paymentRecords, financeRows, monthKey, settings, includeLines) {
  return aggregateFinanceMonthSummary({
    paymentRecords,
    financeTransactions: financeRows,
    monthKey,
    settings,
    includeLines,
  });
}

export function buildYearReconciliationFromRecords(paymentRecords, financeRows, year, settings) {
  return aggregateYearReconciliation(paymentRecords, financeRows, year, settings);
}
