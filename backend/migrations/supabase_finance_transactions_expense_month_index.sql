-- Speed month-scoped expense reads for finance summary.
create index if not exists finance_transactions_gym_expense_month_idx
  on public.finance_transactions (gym_id, tx_type, tx_date)
  where tx_type = 'expense';
