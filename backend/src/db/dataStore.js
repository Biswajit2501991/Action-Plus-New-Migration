import crypto from 'node:crypto';
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

export async function readJsonCollection(key, fallback = [], scope = null, branchScope = null) {
  if (useSupabase()) return supabaseStore.readCollection(key, fallback, scope, branchScope);
  const allRows = await kvStore.readJsonCollection(key, fallback);
  const sandboxed = scope ? allRows.filter((row) => String(row?.sandboxId || '') === scope.sandboxId) : allRows;
  if (!branchScope || !branchScope.gymCodeId) return sandboxed;
  // SQLite parity: legacy non-Supabase backend filters the same shape (members/visitors).
  return sandboxed.filter((row) => String(row?.assignedGymCodeId || '') === String(branchScope.gymCodeId));
}

export async function updateMember(memberCode, patch, branchScope = null) {
  if (useSupabase()) return supabaseStore.updateMemberFields(memberCode, patch, branchScope);
  const rows = await kvStore.readJsonCollection('apg.members', []);
  const idx = rows.findIndex((m) => String(m?.memberId || '').trim() === String(memberCode).trim());
  if (idx === -1) {
    const err = new Error('member-not-found');
    err.status = 404;
    throw err;
  }
  if (branchScope && branchScope.gymCodeId && !branchScope.isOwner) {
    const existing = String(rows[idx]?.assignedGymCodeId || '');
    if (existing !== String(branchScope.gymCodeId)) {
      const err = new Error('member-not-found');
      err.status = 404;
      throw err;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'assignedGymCodeId') && String(patch.assignedGymCodeId || '') !== String(branchScope.gymCodeId)) {
      const err = new Error('cross-branch-write-forbidden');
      err.status = 403;
      throw err;
    }
  }
  const next = { ...rows[idx], ...patch, updatedAt: new Date().toISOString() };
  rows[idx] = next;
  await kvStore.writeJsonCollection('apg.members', rows);
  return next;
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

export async function punchStaffAttendance(scope, payload) {
  if (useSupabase()) return supabaseStore.punchStaffAttendance(scope, payload);
  const settings = (await readJsonValue('apg.settings', {}, scope)) || {};
  const records = Array.isArray(settings.staffAttendance) ? settings.staffAttendance : [];
  const record = applyAttendancePunchToRecords(records, payload);
  settings.staffAttendance = records;
  await writeJsonValue('apg.settings', settings, scope);
  return record;
}

export async function upsertStaffAttendanceRecords(scope, appRecords) {
  if (useSupabase()) return supabaseStore.upsertStaffAttendanceRecords(scope, appRecords);
  const settings = (await readJsonValue('apg.settings', {}, scope)) || {};
  const records = Array.isArray(settings.staffAttendance) ? [...settings.staffAttendance] : [];
  for (const rec of Array.isArray(appRecords) ? appRecords : []) {
    if (!rec?.userId || !rec?.date) continue;
    const dateKey = String(rec.date).slice(0, 10);
    const idx = records.findIndex((r) => String(r.date).slice(0, 10) === dateKey && r.userId === rec.userId);
    if (idx >= 0) records[idx] = { ...records[idx], ...rec, updatedAt: rec.updatedAt || new Date().toISOString() };
    else records.unshift({ ...rec, id: rec.id || crypto.randomUUID() });
  }
  settings.staffAttendance = records;
  await writeJsonValue('apg.settings', settings, scope);
  return records.length;
}

function applyAttendancePunchToRecords(records, { userId, punchType, atIso, timeZone, actorName }) {
  const uid = String(userId || '').trim();
  const at = atIso || new Date().toISOString();
  const today = at.slice(0, 10);
  const actor = actorName || uid;
  const existingIdx = records.findIndex((r) => String(r.date).slice(0, 10) === today && r.userId === uid);
  const existing = existingIdx >= 0 ? records[existingIdx] : null;
  let next;
  if (punchType === 'logout') {
    if (existing) {
      next = { ...existing, lastLogoutAt: at, updatedAt: at, updatedBy: actor };
      records[existingIdx] = next;
    } else {
      next = {
        id: crypto.randomUUID(),
        date: today,
        userId: uid,
        status: 'Present',
        checkIn: '',
        checkOut: '',
        note: '',
        firstLoginAt: '',
        lastLogoutAt: at,
        autoPresentWindowUntil: '',
        timeZoneAtMark: timeZone || null,
        autoMarked: false,
        markedBy: actor,
        updatedAt: at,
        updatedBy: actor,
      };
      records.unshift(next);
    }
  } else {
    const windowUntil = new Date(new Date(at).getTime() + (24 * 60 * 60 * 1000)).toISOString();
    if (existing) {
      next = {
        ...existing,
        status: 'Present',
        autoPresentWindowUntil: existing.autoPresentWindowUntil || windowUntil,
        autoMarked: true,
        timeZoneAtMark: existing.timeZoneAtMark || timeZone || null,
        firstLoginAt: existing.firstLoginAt || at,
        updatedAt: at,
        updatedBy: actor,
      };
      records[existingIdx] = next;
    } else {
      next = {
        id: crypto.randomUUID(),
        date: today,
        userId: uid,
        status: 'Present',
        checkIn: '',
        checkOut: '',
        note: '',
        firstLoginAt: at,
        lastLogoutAt: '',
        autoPresentWindowUntil: windowUntil,
        timeZoneAtMark: timeZone || null,
        autoMarked: true,
        markedBy: actor,
        updatedAt: at,
        updatedBy: actor,
      };
      records.unshift(next);
    }
  }
  return next;
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
