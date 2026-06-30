import { buildExpenseRow, validateExpenseDraft } from './expenseRow.js';

/**
 * Persist one expense via POST /api/finance/expenses.
 * @param {(path: string, init?: RequestInit) => Promise<unknown>} backendJson
 * @param {object} draft
 * @param {{ actor?: string, userId?: string, userName?: string }} [options]
 */
export async function persistExpenseRow(backendJson, draft, options = {}) {
  const validation = validateExpenseDraft(draft);
  if (!validation.ok) {
    const err = new Error(validation.error);
    err.code = validation.error;
    throw err;
  }
  const row = buildExpenseRow(draft, options);
  const saved = await backendJson('/finance/expenses', {
    method: 'POST',
    body: JSON.stringify(row),
  });
  if (saved && typeof saved === 'object' && saved.id) {
    return saved;
  }
  return row;
}

/**
 * @param {(path: string, init?: RequestInit) => Promise<unknown>} backendJson
 * @param {string} externalTxId
 */
export async function deleteExpenseRow(backendJson, externalTxId) {
  const id = encodeURIComponent(String(externalTxId || '').trim());
  if (!id) throw new Error('expense-id-required');
  return backendJson(`/finance/expenses/${id}`, { method: 'DELETE' });
}

/** Income-only rows for debounced bulk sync (expenses use row API). */
export function financeRowsForBulkSync(financeTransactions) {
  return (Array.isArray(financeTransactions) ? financeTransactions : [])
    .filter((t) => t && String(t.type || '').toLowerCase() !== 'expense');
}
