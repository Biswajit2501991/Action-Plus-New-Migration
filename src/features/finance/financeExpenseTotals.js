import { paymentInCalendarMonth } from './paymentCalendarMonth.js';

/** Sum manual expense rows for a calendar month (YYYY-MM). */
export function sumExpenseRowsForMonth(financeTransactions, monthKey) {
  const key = String(monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(key)) return 0;
  return (Array.isArray(financeTransactions) ? financeTransactions : [])
    .filter((t) => t?.type === 'expense' && paymentInCalendarMonth(t.date, key))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
}

/** Expense ledger rows for a month (from persisted financeTransactions / GET /finance). */
export function expenseRowsForMonth(financeTransactions, monthKey) {
  const key = String(monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(key)) return [];
  return (Array.isArray(financeTransactions) ? financeTransactions : [])
    .filter((t) => t?.type === 'expense' && paymentInCalendarMonth(t.date, key))
    .map((t) => ({
      id: t.id,
      type: 'expense',
      date: String(t.date || '').slice(0, 10),
      amount: Number(t.amount || 0),
      category: t.category || '',
      plan: t.plan || 'Expense',
      note: t.note || '',
      addedBy: t.addedBy || '',
    }));
}
