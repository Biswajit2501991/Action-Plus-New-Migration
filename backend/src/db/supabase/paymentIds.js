/**
 * Stable payment row identity — mirrors frontend stablePaymentHistoryRowId / normalize.
 */

/** YYYY-MM-DD key aligned with frontend localCalendarDateKey for API ISO strings. */
export function calendarDateKey(value) {
  if (value === null || value === undefined || value === '') return '';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Collapses duplicate payment rows (same logical payment, different external ids).
 * Mirrors frontend paymentHistoryCanonicalDedupeKey.
 */
export function paymentHistoryCanonicalDedupeKey(h) {
  if (!h || typeof h !== 'object') return '';
  const paidRaw = String(h.paidAt || h.receivedAt || h.date || h.ts || '').trim();
  const dayKey = calendarDateKey(paidRaw);
  const month = String(h.billingMonth || (paidRaw.length >= 7 ? paidRaw.slice(0, 7) : '')).trim();
  const amt = Number(h.amount || 0);
  const method = String(h.method || h.paymentMethod || '').trim().toLowerCase();
  const by = String(h.recordedBy || h.by || '').trim().toLowerCase();
  const source = String(h.source || '').trim().toLowerCase();
  const note = String(h.note || '').trim();
  if (!dayKey && !amt && !method) return '';
  return `${dayKey}|${month}|${amt}|${method}|${by}|${source}|${note}`;
}

export function stablePaymentHistoryRowId(row, memberCode = '') {
  if (row && row.id != null) {
    const raw = String(row.id).trim();
    if (raw) return raw;
  }
  if (!row || typeof row !== 'object') return '';
  const paidAt = String(row.paidAt || row.receivedAt || row.date || row.ts || '').trim();
  const paidDay = calendarDateKey(paidAt) || paidAt;
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
  const sig = stablePaymentHistoryRowId({ ...row, id: '' }, memberCode);
  if (sig && sig === pid) return true;
  const canon = paymentHistoryCanonicalDedupeKey(row);
  if (canon && pid.startsWith('sig:')) {
    const parts = pid.split('|');
    if (parts.length >= 2) {
      const sigDay = parts[1] || '';
      const sigAmt = Number(parts[2] || 0);
      const rowDay = calendarDateKey(row.paidAt || row.receivedAt || row.date || row.ts);
      if (rowDay === sigDay && Number(row.amount || 0) === sigAmt && canon) {
        return true;
      }
    }
  }
  if (canon && paymentHistoryCanonicalDedupeKey({ id: pid }) === canon) return true;
  return false;
}
