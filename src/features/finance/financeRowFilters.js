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
/**
 * Branch-scoped finance read/write.
 * - Global / unlimited scope: all rows.
 * - Expenses: must match scope gymCodeId (or allowedBranchIds).
 * - Income: member must be in scope.memberCodes when that set is present.
 */
export function branchScopeAllowsFinanceRow(row, scope) {
  if (!row || typeof row !== 'object') return false;
  if (!scope?.limited) return true;
  if (String(row.type || '').toLowerCase() === 'expense') {
    const rowBranch = String(row.gymCodeId || row.gym_code_id || '').trim();
    if (!rowBranch) return false;
    const active = String(scope.gymCodeId || '').trim();
    if (active && rowBranch === active) return true;
    const allowed = Array.isArray(scope.allowedBranchIds) ? scope.allowedBranchIds : [];
    return allowed.some((id) => String(id || '').trim() === rowBranch);
  }
  if (!scope.memberCodes) return false;
  const mid = String(row.memberId || '').trim();
  return Boolean(mid && scope.memberCodes.has(mid));
}

/**
 * Filter finance rows for summary / reconciliation using resolveReadBranchScope shape.
 * When gymCodeId is set (staff, branch owner, or master with active branch), expenses
 * are limited to that branch. Global master (no gymCodeId) sees all.
 */
export function filterFinanceRowsForBranchScope(rows, branchScope) {
  const list = Array.isArray(rows) ? rows : [];
  if (branchScope?.staffNoBranch) return [];
  const branchId = String(branchScope?.gymCodeId || '').trim();
  if (!branchId) return list;
  return list.filter((row) => {
    if (String(row?.type || '').toLowerCase() !== 'expense') return true;
    return String(row.gymCodeId || row.gym_code_id || '').trim() === branchId;
  });
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
