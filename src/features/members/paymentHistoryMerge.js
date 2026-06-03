/**
 * Merge local and remote member payment history without dropping newer local rows.
 * @param {object[]} localRows
 * @param {object[]} remoteRows
 * @param {object} options
 * @param {boolean} [options.syncPending]
 * @param {string} [options.memberId]
 * @param {boolean} [options.remoteListSlim]
 * @param {(local: object[], remote: object[], cap: number) => object[]} options.mergeArrays
 * @param {number} [options.cap=120]
 */
export function pickMergedPaymentHistory(localRow, remoteRow, options = {}) {
  const {
    syncPending = null,
    memberId = String(localRow?.memberId || remoteRow?.memberId || '').trim(),
    remoteListSlim = Boolean(remoteRow?.__listSlim),
    mergeArrays,
    cap = 120,
  } = options;
  const L = Array.isArray(localRow?.paymentHistory) ? localRow.paymentHistory : [];
  const R = Array.isArray(remoteRow?.paymentHistory) ? remoteRow.paymentHistory : [];
  if (syncPending && memberId && syncPending[memberId]) return L;
  if (remoteListSlim && R.length === 0 && L.length > 0) return L;
  if (typeof mergeArrays === 'function') {
    return mergeArrays(L, R, cap);
  }
  return [...L, ...R];
}
