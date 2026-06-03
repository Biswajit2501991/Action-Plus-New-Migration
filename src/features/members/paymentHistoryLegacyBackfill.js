import { paymentMonthKeyFromValue, billingDateFromPaymentMonth } from '../finance/paymentMonthKey.js';
import { toCalendarDateKey } from './reminderBillingCycle.js';

/**
 * Infer payment history rows from legacy member fields when paymentHistory is empty.
 * @param {object} member
 * @returns {object[]}
 */
export function inferLegacyPaymentRowsForBackfill(member) {
  if (!member || typeof member !== 'object') return [];
  const existing = Array.isArray(member.paymentHistory)
    ? member.paymentHistory.filter((h) => h && typeof h === 'object')
    : [];
  if (existing.length > 0) return [];

  const memberId = String(member.memberId || 'member').trim();
  const amount = Number(member.amount || 0);
  if (amount <= 0) return [];

  const rows = [];

  const receivedRaw = String(member.paymentReceivedAt || '').trim();
  if (receivedRaw) {
    const paidDay = toCalendarDateKey(receivedRaw);
    const monthKey = paymentMonthKeyFromValue(receivedRaw);
    rows.push({
      id: `legacy-${memberId}-${monthKey || 'unknown'}-received`,
      paidAt: receivedRaw,
      receivedAt: receivedRaw,
      amount,
      method: String(member.paymentMethod || '').trim(),
      recordedBy: '',
      source: 'legacy-backfill',
      note: 'Backfilled from paymentReceivedAt',
      billingMonth: monthKey,
      billingDate: billingDateFromPaymentMonth(monthKey),
    });
    return rows;
  }

  const billingRaw = member.billingDate;
  if (billingRaw) {
    const paidDay = toCalendarDateKey(billingRaw);
    if (paidDay) {
      const monthKey = paidDay.slice(0, 7);
      rows.push({
        id: `legacy-${memberId}-${monthKey}-billing`,
        paidAt: paidDay,
        receivedAt: paidDay,
        amount,
        method: String(member.paymentMethod || '').trim(),
        recordedBy: '',
        source: 'legacy-backfill',
        note: 'Backfilled from billingDate',
        billingMonth: monthKey,
        billingDate: billingDateFromPaymentMonth(monthKey),
      });
    }
  }

  return rows;
}

/**
 * @param {object} member
 * @returns {{ member: object, changed: boolean, added: number }}
 */
export function applyPaymentHistoryBackfillToMember(member) {
  const inferred = inferLegacyPaymentRowsForBackfill(member);
  if (!inferred.length) {
    return { member, changed: false, added: 0 };
  }
  const base = Array.isArray(member.paymentHistory) ? member.paymentHistory : [];
  return {
    member: {
      ...member,
      paymentHistory: [...inferred, ...base],
      updatedAt: new Date().toISOString(),
    },
    changed: true,
    added: inferred.length,
  };
}
