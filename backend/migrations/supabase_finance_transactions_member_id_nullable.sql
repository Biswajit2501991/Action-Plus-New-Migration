-- Expense rows are gym-level (no member). member_id was NOT NULL, blocking all expense inserts.
-- Safe to run multiple times.

do $$
begin
  alter table public.finance_transactions
    alter column member_id drop not null;
exception
  when others then
    raise notice 'finance_transactions.member_id nullable: %', sqlerrm;
end $$;
