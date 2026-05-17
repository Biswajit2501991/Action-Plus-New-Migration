import { env } from '../config/env.js';
import { initMembersTableName } from './tables.js';
import * as kvStore from './kvStore.js';
import { getSupabase } from './supabase/client.js';
import { membersBulkUpsertReady } from './supabase/membersWrite.js';
import * as supabaseStore from './supabase/repository.js';

export function useSupabase() {
  if (env.DATA_BACKEND === 'supabase') return true;
  if (env.DATA_BACKEND === 'sqlite') return false;
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.APG_GYM_ID);
}

export function dataBackendLabel() {
  return useSupabase() ? 'supabase' : 'sqlite';
}

export async function readJsonCollection(key, fallback = [], scope = null) {
  if (useSupabase()) return supabaseStore.readCollection(key, fallback, scope);
  const allRows = await kvStore.readJsonCollection(key, fallback);
  if (!scope) return allRows;
  return allRows.filter((row) => String(row?.sandboxId || '') === scope.sandboxId);
}

export async function writeJsonCollection(key, value, scope = null) {
  if (useSupabase()) return supabaseStore.writeCollection(key, value, scope);
  if (!scope) return kvStore.writeJsonCollection(key, value);
  const allRows = await kvStore.readJsonCollection(key, []);
  const kept = allRows.filter((row) => String(row?.sandboxId || '') !== scope.sandboxId);
  const scopedRows = (Array.isArray(value) ? value : []).map((row) => ({
    ...(row && typeof row === 'object' ? row : {}),
    sandboxId: scope.sandboxId,
    createdByTestUserId: scope.userId || (row && row.createdByTestUserId) || '',
  }));
  return kvStore.writeJsonCollection(key, [...kept, ...scopedRows]);
}

export async function readJsonValue(key, fallback = null, scope = null) {
  if (useSupabase()) {
    if (key === 'apg.settings') return supabaseStore.readSettingsValue(scope);
    return fallback;
  }
  if (!scope) return kvStore.readJsonValue(key, fallback);
  return kvStore.readJsonValue(`apg.settings.sandbox.${scope.sandboxId}`, fallback);
}

export async function writeJsonValue(key, value, scope = null) {
  if (useSupabase()) {
    if (key === 'apg.settings') return supabaseStore.writeSettingsValue(value, scope);
    return;
  }
  if (!scope) return kvStore.writeJsonValue(key, value);
  return kvStore.writeJsonValue(`apg.settings.sandbox.${scope.sandboxId}`, value || {});
}

export async function purgeSandboxData(sandboxId) {
  if (useSupabase()) return supabaseStore.purgeSandbox(sandboxId);
  const id = String(sandboxId || '').trim();
  if (!id) return;
  const keys = ['apg.members', 'apg.visitors', 'apg.logs', 'apg.finance', 'apg.sms.events'];
  for (const key of keys) {
    const rows = await kvStore.readJsonCollection(key, []);
    const nextRows = rows.filter((row) => String(row?.sandboxId || '') !== id);
    await kvStore.writeJsonCollection(key, nextRows);
  }
  await kvStore.writeJsonValue(`apg.settings.sandbox.${id}`, {});
}

export async function pingDataStore() {
  if (useSupabase()) {
    const sb = getSupabase();
    await initMembersTableName(sb);
    await membersBulkUpsertReady();
    return supabaseStore.ping();
  }
  await kvStore.readJsonCollection('apg.members', []);
  return true;
}
