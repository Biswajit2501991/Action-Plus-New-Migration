-- Unique keys for upsert-based sync (run once in Supabase SQL Editor).

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'visitors_gym_id_external_visitor_id_key'
  ) then
    alter table public.visitors
      add constraint visitors_gym_id_external_visitor_id_key unique (gym_id, external_visitor_id);
  end if;
exception when others then
  raise notice 'visitors unique: %', sqlerrm;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'finance_transactions_gym_id_external_tx_id_key'
  ) then
    alter table public.finance_transactions
      add constraint finance_transactions_gym_id_external_tx_id_key unique (gym_id, external_tx_id);
  end if;
exception when others then
  raise notice 'finance_transactions unique: %', sqlerrm;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sms_status_events_gym_id_external_event_id_key'
  ) then
    alter table public.sms_status_events
      add constraint sms_status_events_gym_id_external_event_id_key unique (gym_id, external_event_id);
  end if;
exception when others then
  raise notice 'sms_status_events unique: %', sqlerrm;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'audit_logs_gym_id_external_log_id_key'
  ) then
    alter table public.audit_logs
      add constraint audit_logs_gym_id_external_log_id_key unique (gym_id, external_log_id);
  end if;
exception when others then
  raise notice 'audit_logs unique: %', sqlerrm;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'member_payment_history_gym_member_external_payment_key'
  ) then
    alter table public.member_payment_history
      add constraint member_payment_history_gym_member_external_payment_key
      unique (gym_id, member_id, external_payment_id);
  end if;
exception when others then
  raise notice 'member_payment_history unique: %', sqlerrm;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'member_message_history_gym_member_external_event_key'
  ) then
    alter table public.member_message_history
      add constraint member_message_history_gym_member_external_event_key
      unique (gym_id, member_id, external_event_id);
  end if;
exception when others then
  raise notice 'member_message_history unique: %', sqlerrm;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'member_injury_notes_gym_member_external_note_key'
  ) then
    alter table public.member_injury_notes
      add constraint member_injury_notes_gym_member_external_note_key
      unique (gym_id, member_id, external_note_id);
  end if;
exception when others then
  raise notice 'member_injury_notes unique: %', sqlerrm;
end $$;
