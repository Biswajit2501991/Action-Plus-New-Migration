/**
 * Stable payment row identity — mirrors frontend stablePaymentHistoryRowId / normalize.
 */

export function stablePaymentHistoryRowId(row, memberCode = '') {
  if (row && row.id != null) {
    const raw = String(row.id).trim();
    if (raw) return raw;
  }
  if (!row || typeof row !== 'object') return '';
  const paidAt = String(row.paidAt || row.receivedAt || row.date || row.ts || '').trim();
  const paidDay = paidAt.length >= 10 ? paidAt.slice(0, 10) : paidAt;
  const amount = Number(row.amount || 0);
  const method = String(row.method || row.paymentMethod || '').trim();
  const by = String(row.recordedBy || row.by || '').trim();
  const source = String(row.source || '').trim();
  const note = String(row.note || '').trim();
  const billingMonth = String(row.billingMonth || '').trim();
  return `sig:${memberCode}|${paidDay}|${amount}|${method}|${by}|${source}|${note}|${billingMonth}`;
}

export function paymentRowMatchesId(row, memberCode, paymentId) {
  const pid = String(paymentId || '').trim();
  if (!pid || !row) return false;
  const rawId = String(row.id || '').trim();
  if (rawId && rawId === pid) return true;
  // UI may show a stable sig: id while the stored row still has a UUID (or no id).
  const sig = stablePaymentHistoryRowId({ ...row, id: '' }, memberCode);
  return sig === pid;
}
