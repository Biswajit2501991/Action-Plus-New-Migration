/**
 * Expense breakdown by category from manual expense ledger rows.
 */

/**
 * @param {object[]} expenseRows reporting-month expense ledger rows
 * @returns {{ categories: { name: string, amount: number }[], total: number }}
 */
export function buildExpenseBreakdown(expenseRows) {
  const map = new Map();
  for (const row of Array.isArray(expenseRows) ? expenseRows : []) {
    if (!row || row.type !== 'expense') continue;
    const name = String(row.category || row.plan || 'General').trim() || 'General';
    map.set(name, (map.get(name) || 0) + Number(row.amount || 0));
  }
  const categories = [...map.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount);
  const total = categories.reduce((s, c) => s + c.amount, 0);
  return { categories, total };
}
