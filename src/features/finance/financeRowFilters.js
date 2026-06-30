/**
 * Finance rows mirrored from member billing / payment history must not be
 * counted again as manual income when member_payment_history is authoritative.
 */

export function isMirroredMemberPaymentFinanceRow(row) {
  if (!row || typeof row !== 'object') return false;
  if (String(row.type || '').toLowerCase() === 'expense') return false;
  const note = String(row.note || '').toLowerCase();
  if (note.includes('imported from member billing')) return true;
  const source = String(row.source || '').trim().toLowerCase();
  return source === 'payment';
}

/** Manual income rows safe to add on top of member payment history. */
export function manualIncomeFinanceRows(financeTransactions) {
  return (Array.isArray(financeTransactions) ? financeTransactions : [])
    .filter((t) => t && t.type !== 'expense' && !isMirroredMemberPaymentFinanceRow(t));
}

/**
 * Strip billing-mirror rows before finance bulk sync (Supabase backend mode).
 * Member payments live in member_payment_history; mirrored finance rows double-count revenue.
 * @param {object[]} rows
 * @returns {{ rows: object[], strippedMirroredRows: number }}
 */
/** Branch-scoped finance read/write: expenses have no member; income needs in-scope member. */
export function branchScopeAllowsFinanceRow(row, scope) {
  if (!row || typeof row !== 'object') return false;
  if (String(row.type || '').toLowerCase() === 'expense') return true;
  const mid = String(row.memberId || '').trim();
  return Boolean(mid && scope?.memberCodes?.has(mid));
}

export function filterFinanceBulkWriteRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const accepted = [];
  let strippedMirroredRows = 0;
  for (const row of list) {
    if (isMirroredMemberPaymentFinanceRow(row)) {
      strippedMirroredRows += 1;
      continue;
    }
    accepted.push(row);
  }
  return { rows: accepted, strippedMirroredRows };
}
