import { paymentMonthKeyFromValue } from './paymentMonthKey.js';

/**
 * @param {object} member
 * @param {object} options
 * @param {string} [options.todayKey]
 * @param {boolean} [options.includeBillingFallback]
 * @param {boolean} [options.paymentHistoryOnly]
 * @param {(member: object) => object[]} options.normalizeMemberPaymentHistory
 * @param {(member: object, opts?: object) => Date|null} [options.retentionPaymentDeadline]
 * @param {(value: unknown) => string} [options.localCalendarDateKey]
 * @param {(date: Date) => string} [options.isoDate]
 */
export function collectMemberRevenueEntries(member, options = {}) {
  const {
    todayKey = '',
    includeBillingFallback = true,
    paymentHistoryOnly = false,
    normalizeMemberPaymentHistory,
    retentionPaymentDeadline = () => null,
    localCalendarDateKey = (v) => String(v || '').slice(0, 10),
    isoDate = (d) => d.toISOString().slice(0, 10),
  } = options;

  if (!member || typeof member !== 'object' || typeof normalizeMemberPaymentHistory !== 'function') {
    return [];
  }

  const history = normalizeMemberPaymentHistory(member);
  if (history.length > 0) {
    return history
      .map((h) => ({
        receivedAt: h.paidAt || h.receivedAt || h.date || '',
        amount: Number(h.amount ?? member.amount ?? 0),
      }))
      .filter((h) => h.receivedAt && Number(h.amount || 0) > 0);
  }
  if (paymentHistoryOnly) return [];

  const messageDerived = Array.isArray(member.messageHistory)
    ? Array.from(
        member.messageHistory
          .filter((ev) => ev && ev.templateKey === 'success' && (ev.sentAt || ev.ts))
          .reduce((acc, ev) => {
            const key = localCalendarDateKey(ev.sentAt || ev.ts);
            if (!key) return acc;
            if (!acc.has(key)) {
              acc.set(key, {
                receivedAt: ev.sentAt || ev.ts,
                amount: Number(member.amount || 0),
              });
            }
            return acc;
          }, new Map())
          .values(),
      ).filter((h) => h.receivedAt && Number(h.amount || 0) > 0)
    : [];
  if (messageDerived.length > 0) return messageDerived;

  if (member.paymentReceivedAt) {
    return [{
      receivedAt: member.paymentReceivedAt,
      amount: Number(member.amount || 0),
    }];
  }
  if (!includeBillingFallback) return [];
  if (member.billingDate && Number(member.amount || 0) > 0) {
    const due = retentionPaymentDeadline(member);
    const todayUtc = todayKey ? new Date(`${todayKey}T12:00:00.000Z`) : null;
    const pending = member.status === 'Active' && due && todayUtc && due < todayUtc;
    if (!pending) {
      return [{
        receivedAt: isoDate(member.billingDate instanceof Date ? member.billingDate : new Date(member.billingDate)),
        amount: Number(member.amount || 0),
      }];
    }
  }
  return [];
}

/**
 * @param {object[]} members
 * @param {object} deps — same as collectMemberRevenueEntries options
 */
export function buildCollectedRevenueEntries(members, deps = {}) {
  const todayKey = deps.todayKey || '';
  return (Array.isArray(members) ? members : []).flatMap((m) =>
    collectMemberRevenueEntries(m, {
      ...deps,
      todayKey,
      includeBillingFallback: false,
      paymentHistoryOnly: true,
    }),
  );
}

/** Manual finance_transactions income rows by transaction date. */
export function buildManualIncomeRevenueEntries(financeTransactions, calendarDateKey) {
  const toKey = typeof calendarDateKey === 'function'
    ? calendarDateKey
    : (v) => String(v || '').slice(0, 10);
  return (Array.isArray(financeTransactions) ? financeTransactions : [])
    .filter((t) => t && t.type !== 'expense')
    .map((t) => ({
      receivedAt: toKey(t.date) || String(t.date || '').trim(),
      amount: Number(t.amount || 0),
    }))
    .filter((r) => r.receivedAt && Number(r.amount || 0) > 0);
}

export function buildAllFinanceRevenueEntries(members, financeTransactions, deps = {}) {
  const memberEntries = buildCollectedRevenueEntries(members, deps);
  const manualEntries = buildManualIncomeRevenueEntries(
    financeTransactions,
    deps.localCalendarDateKey,
  );
  return [...memberEntries, ...manualEntries];
}
