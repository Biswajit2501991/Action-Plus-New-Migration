import { useSupabase } from '../db/dataStore.js';
import { gymId, getSupabase } from '../db/supabase/client.js';
import { membersTableName, T } from '../db/tables.js';
import { broadcastChange } from './hub.js';

let channel = null;
let started = false;

function buildTableCollection() {
  return {
    [membersTableName]: 'members',
    [T.staff_users]: 'users',
    [T.staff_user_sections]: 'users',
    [T.staff_user_access]: 'users',
    [T.visitors]: 'visitors',
    [T.finance_transactions]: 'finance',
    [T.audit_logs]: 'logs',
    [T.sms_status_events]: 'smsEvents',
    [T.settings_lookup_values]: 'settings',
    [T.settings_templates]: 'settings',
    [T.settings_app_config]: 'settings',
    [T.settings_staff_directory]: 'settings',
    [T.staff_role_templates]: 'settings',
    [T.leave_requests]: 'settings',
    [T.staff_attendance_records]: 'settings',
    [T.pt_client_profiles]: 'settings',
    [T.member_payment_history]: 'members',
    [T.member_message_history]: 'members',
    [T.member_attachments]: 'members',
    [T.member_injury_notes]: 'members',
  };
}

/** Tables without gym_id (legacy single-gym schema) must not use gym_id realtime filters. */
const GYM_FILTERED = new Set([
  T.staff_users,
  T.visitors,
  T.finance_transactions,
  T.sms_status_events,
  T.settings_lookup_values,
  T.settings_templates,
  T.settings_app_config,
  T.settings_staff_directory,
  T.staff_role_templates,
  T.leave_requests,
  T.staff_attendance_records,
  T.pt_client_profiles,
  T.member_payment_history,
  T.member_message_history,
  T.member_attachments,
  T.member_injury_notes,
]);

function onTableChange(tableMap, table) {
  const collection = tableMap[table];
  if (collection) broadcastChange(collection, { source: 'supabase' });
}

export function notifyCollectionChange(collection) {
  broadcastChange(collection, { source: 'local' });
}

export function startSupabaseRealtimeListener() {
  if (started || !useSupabase()) return { ok: false, reason: 'not-supabase' };
  started = true;

  const sb = getSupabase();
  const gid = gymId();
  const tableMap = buildTableCollection();
  const tables = [...new Set(Object.keys(tableMap))];

  GYM_FILTERED.add(membersTableName);

  channel = sb.channel(`apg-gym-${gid}`, {
    config: { broadcast: { self: false } },
  });

  for (const table of tables) {
    const opts = {
      event: '*',
      schema: 'public',
      table,
    };
    if (GYM_FILTERED.has(table)) {
      opts.filter = `gym_id=eq.${gid}`;
    }
    channel.on('postgres_changes', opts, () => onTableChange(tableMap, table));
  }

  try {
    const sub = channel.subscribe((status, err) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        // eslint-disable-next-line no-console
        console.warn('[realtime] channel issue:', status, err?.message || err || '');
      }
    });
    if (sub && typeof sub.catch === 'function') {
      sub.catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[realtime] subscribe failed:', err?.message || err || '');
      });
    }
  } catch (err) {
    started = false;
    channel = null;
    // eslint-disable-next-line no-console
    console.warn('[realtime] setup failed:', err?.message || err || '');
    return { ok: false, reason: 'subscribe-failed' };
  }

  return { ok: true, tables: tables.length };
}

export function realtimeListenerStatus() {
  return {
    started,
    subscribed: Boolean(channel),
    state: channel?.state || 'idle',
    membersTable: membersTableName,
  };
}
