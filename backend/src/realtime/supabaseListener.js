import { useSupabase } from '../db/dataStore.js';
import { gymId, getSupabase } from '../db/supabase/client.js';
import { membersTableName, T } from '../db/tables.js';
import { broadcastChange } from './hub.js';

let channel = null;
let started = false;
const gymIdColumnCache = new Map();

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
    [T.branch_custom_templates]: 'customTemplates',
    [T.settings_app_config]: 'settings',
    [T.settings_staff_directory]: 'settings',
    [T.staff_role_templates]: 'settings',
    [T.leave_requests]: 'settings',
    [T.staff_attendance_records]: 'settings',
    [T.pt_client_profiles]: 'settings',
    [T.member_payment_history]: 'members',
    [T.member_paid_for_month]: 'finance',
    [T.member_message_history]: 'members',
    [T.member_attachments]: 'members',
    [T.member_injury_notes]: 'members',
  };
}

/** Tables that may use gym_id filters when the column exists (audit_logs excluded — legacy schema). */
const GYM_FILTER_CANDIDATES = new Set([
  T.staff_users,
  T.visitors,
  T.finance_transactions,
  T.sms_status_events,
  T.settings_lookup_values,
  T.settings_templates,
  T.branch_custom_templates,
  T.settings_app_config,
  T.settings_staff_directory,
  T.staff_role_templates,
  T.leave_requests,
  T.staff_attendance_records,
  T.pt_client_profiles,
  T.member_payment_history,
  T.member_paid_for_month,
  T.member_message_history,
  T.member_attachments,
  T.member_injury_notes,
]);

async function tableHasGymIdColumn(sb, table) {
  if (gymIdColumnCache.has(table)) return gymIdColumnCache.get(table);
  const { error } = await sb.from(table).select('gym_id').limit(0);
  const has = !(error && String(error.message || '').includes('gym_id'));
  gymIdColumnCache.set(table, has);
  return has;
}

async function resolveGymFilteredTables(sb, tables) {
  const filtered = new Set();
  const candidates = [...GYM_FILTER_CANDIDATES, membersTableName];
  for (const table of candidates) {
    if (!tables.includes(table)) continue;
    if (await tableHasGymIdColumn(sb, table)) filtered.add(table);
  }
  return filtered;
}

function onTableChange(tableMap, table) {
  const collection = tableMap[table];
  if (collection) broadcastChange(collection, { source: 'supabase' });
}

export function notifyCollectionChange(collection) {
  broadcastChange(collection, { source: 'local' });
}

export async function startSupabaseRealtimeListener() {
  if (started || !useSupabase()) return { ok: false, reason: 'not-supabase' };
  started = true;

  const sb = getSupabase();
  const gid = gymId();
  const tableMap = buildTableCollection();
  const tables = [...new Set(Object.keys(tableMap))];
  const gymFiltered = await resolveGymFilteredTables(sb, tables);

  channel = sb.channel(`apg-gym-${gid}`, {
    config: { broadcast: { self: false } },
  });

  for (const table of tables) {
    const opts = {
      event: '*',
      schema: 'public',
      table,
    };
    if (gymFiltered.has(table)) {
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

  return { ok: true, tables: tables.length, gymFiltered: gymFiltered.size };
}

export function realtimeListenerStatus() {
  return {
    started,
    subscribed: Boolean(channel),
    state: channel?.state || 'idle',
    membersTable: membersTableName,
  };
}
