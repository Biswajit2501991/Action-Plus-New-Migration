import { paymentMonthKeyFromValue } from '../finance/paymentMonthKey.js';

/**
 * @param {object} row payment history row
 * @param {(value: unknown) => string} [monthKeyFn]
 */
export function paymentRowMonthKey(row, monthKeyFn = paymentMonthKeyFromValue) {
  const fn = typeof monthKeyFn === 'function' ? monthKeyFn : paymentMonthKeyFromValue;
  return fn(row?.paidAt || row?.receivedAt || row?.date || row?.ts || '') || String(row?.billingMonth || '').trim();
}

/**
 * @param {object[]} rows
 * @param {string} monthFilter YYYY-MM or '' for all
 */
export function filterPaymentRowsByMonth(rows, monthFilter) {
  const key = String(monthFilter || '').trim();
  const list = Array.isArray(rows) ? rows : [];
  if (!key) return list;
  return list.filter((row) => paymentRowMonthKey(row) === key);
}

/**
 * Unique YYYY-MM keys from payment rows, newest first.
 * @param {object[]} rows
 * @returns {string[]}
 */
export function paymentHistoryMonthOptions(rows) {
  const seen = new Set();
  const keys = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const k = paymentRowMonthKey(row);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    keys.push(k);
  }
  keys.sort((a, b) => b.localeCompare(a));
  return keys;
}

/**
 * @param {object[]} rows
 */
export function sumPaymentRowAmounts(rows) {
  return (Array.isArray(rows) ? rows : []).reduce((sum, row) => sum + Number(row?.amount || 0), 0);
}
