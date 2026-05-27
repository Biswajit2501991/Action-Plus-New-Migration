import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { initMembersTableName } from './tables.js';
import * as kvStore from './kvStore.js';
import { getSupabase } from './supabase/client.js';
import { membersBulkUpsertReady } from './supabase/membersWrite.js';
import { visitorsHaveGymCodeColumn } from './supabase/visitorsSchema.js';
import * as supabaseStore from './supabase/repository.js';

export function useSupabase() {
  if (env.DATA_BACKEND === 'supabase') return true;
  if (env.DATA_BACKEND === 'sqlite') return false;
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.APG_GYM_ID);
}

export function dataBackendLabel() {
  return useSupabase() ? 'supabase' : 'sqlite';
}

export async function readJsonCollection(key, fallback = [], scope = null, branchScope = null, options = {}) {
  if (useSupabase()) return supabaseStore.readCollection(key, fallback, scope, branchScope, options);
  const allRows = await kvStore.readJsonCollection(key, fallback);
  const sandboxed = scope ? allRows.filter((row) => String(row?.sandboxId || '') === scope.sandboxId) : allRows;
  let filtered = sandboxed;
  if (branchScope && !branchScope.isOwner && branchScope.staffNoBranch) {
    filtered = [];
  } else if (branchScope && !branchScope.isOwner && branchScope.gymCodeId) {
    filtered = sandboxed.filter((row) => String(row?.assignedGymCodeId || '') === String(branchScope.gymCodeId));
  } else if (branchScope && !branchScope.isOwner) {
    filtered = [];
  }
  if (key === 'apg.members' && (options.view === 'list' || options.includeChildren === false)) {
    const { slimAppMember } = await import('./supabase/mappers.js');
    return filtered.map(slimAppMember);
  }
  if (key === 'apg.members' && options.updatedSince) {
    const sinceMs = new Date(options.updatedSince).getTime();
    if (Number.isFinite(sinceMs)) {
      filtered = filtered.filter((row) => {
        const ts = new Date(row?.updatedAt || row?.createdAt || 0).getTime();
        return ts >= sinceMs;
      });
    }
  }
  return filtered;
}

export async function readMember(memberCode, branchScope = null) {
  if (useSupabase()) return supabaseStore.readMemberByCode(memberCode, branchScope);
  const rows = await kvStore.readJsonCollection('apg.members', []);
  const code = String(memberCode || '').trim();
  const found = rows.find((m) => String(m?.memberId || '').trim() === code);
  if (!found) return null;
  if (branchScope && !branchScope.isOwner) {
    if (branchScope.staffNoBranch) return null;
    if (String(found.assignedGymCodeId || '') !== String(branchScope.gymCodeId)) return null;
  }
  return found;
}

export async function assertStaffPaymentDeletesAllowed(incomingMembers, branchScope = null) {
  if (useSupabase()) return supabaseStore.assertStaffPaymentDeletesAllowed(incomingMembers, branchScope);
  // SQLite parity: compare against KV snapshot for members that include paymentHistory.
  const withPayments = (incomingMembers || []).filter((m) =>
    Object.prototype.hasOwnProperty.call(m || {}, 'paymentHistory'));
  if (!withPayments.length) return;
  const rows = await kvStore.readJsonCollection('apg.members', []);
  const byId = new Map(rows.map((m) => [String(m?.memberId || ''), m]));
  const removed = [];
  for (const next of withPayments) {
    const code = String(next?.memberId || '').trim();
    if (!code) continue;
    const prev = byId.get(code);
    if (!prev) continue;
    const prevHist = Array.isArray(prev.paymentHistory) ? prev.paymentHistory : [];
    if (!prevHist.length) continue;
    const nextHist = Array.isArray(next.paymentHistory) ? next.paymentHistory : [];
    const nextIds = new Set(nextHist.map((p) => String(p?.id || '').trim()).filter(Boolean));
    for (const p of prevHist) {
      const pid = String(p?.id || '').trim();
      if (pid && !nextIds.has(pid)) removed.push({ memberCode: code, paymentId: pid });
    }
  }
  if (removed.length) {
    const err = new Error('payment-delete-forbidden');
    err.status = 403;
    err.detail = { removed: removed.slice(0, 5) };
    throw err;
  }
}

export async function deleteMemberPayment(memberCode, paymentId, branchScope = null) {
  if (useSupabase()) return supabaseStore.deleteMemberPayment(memberCode, paymentId, branchScope);
  const rows = await kvStore.readJsonCollection('apg.members', []);
  const code = String(memberCode || '').trim();
  const pid = String(paymentId || '').trim();
  const idx = rows.findIndex((m) => String(m?.memberId || '').trim() === code);
  if (idx === -1) {
    const err = new Error('member-not-found');
    err.status = 404;
    throw err;
  }
  const hist = Array.isArray(rows[idx].paymentHistory) ? rows[idx].paymentHistory : [];
  const after = hist.filter((p) => String(p?.id || '') !== pid);
  if (after.length === hist.length) {
    const err = new Error('payment-not-found');
    err.status = 404;
    throw err;
  }
  rows[idx] = { ...rows[idx], paymentHistory: after, updatedAt: new Date().toISOString() };
  await kvStore.writeJsonCollection('apg.members', rows);
  return { ok: true, deleted: true, paymentId: pid, member: rows[idx] };
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

export async function readJsonValue(key, fallback = null, scope = null, options = {}) {
  if (useSupabase()) {
    if (key === 'apg.settings') return supabaseStore.readSettingsValue(scope, options);
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

/**
 * Read staff attendance rows in a calendar-date range (YYYY-MM-DD inclusive).
 * Supabase path avoids loading the full attendance table via settings.
 */
export async function readStaffAttendanceInRange(scope, { startDate, endDate }) {
  if (useSupabase()) return supabaseStore.readStaffAttendanceInRange(scope, { startDate, endDate });
  const settings = (await readJsonValue('apg.settings', {}, scope)) || {};
  const records = Array.isArray(settings.staffAttendance) ? settings.staffAttendance : [];
  const start = String(startDate || '').slice(0, 10);
  const end = String(endDate || '').slice(0, 10);
  return records.filter((r) => {
    const d = String(r?.date || '').slice(0, 10);
    return d >= start && d <= end;
  });
}

/**
 * Owner-only bulk delete of staff attendance rows where attendance_date is in
 * [startDate, endDate] (YYYY-MM-DD). Mirrors the behaviour on both backends so
 * the sqlite fallback stays usable for local dev.
 */
export async function deleteAttendanceRecordsInRange(scope, payload) {
  const start = String(payload?.startDate || '').slice(0, 10);
  const end = String(payload?.endDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    throw new Error('startDate and endDate must be YYYY-MM-DD');
  }
  if (start > end) throw new Error('startDate must be <= endDate');
  if (useSupabase()) {
    return supabaseStore.deleteAttendanceRecordsInRange(scope, { startDate: start, endDate: end });
  }
  const settings = (await readJsonValue('apg.settings', {}, scope)) || {};
  const records = Array.isArray(settings.staffAttendance) ? settings.staffAttendance : [];
  const kept = [];
  let deleted = 0;
  for (const r of records) {
    const d = String(r?.date || '').slice(0, 10);
    if (d >= start && d <= end) {
      deleted += 1;
      continue;
    }
    kept.push(r);
  }
  settings.staffAttendance = kept;
  await writeJsonValue('apg.settings', settings, scope);
  return { deleted };
}

/** Returns the WhatsApp templates for the active gym as { templates, updatedAt }. */
export async function readWhatsappTemplates(scope) {
  if (useSupabase()) return supabaseStore.getWhatsappTemplates(scope);
  const settings = (await readJsonValue('apg.settings', {}, scope)) || {};
  const sms = settings.smsTemplates && typeof settings.smsTemplates === 'object' ? settings.smsTemplates : {};
  return { templates: { ...sms }, updatedAt: null };
}

/**
 * Append a single audit log entry without round-tripping the entire
 * collection. Used by the cleanup endpoints so destructive owner actions
 * still leave a breadcrumb cheaply. Errors are swallowed at the caller.
 */
export async function appendAuditLogEntry(scope, entry) {
  if (useSupabase()) return supabaseStore.insertAuditLogRow(scope, entry);
  const rows = await kvStore.readJsonCollection('apg.logs', []);
  await kvStore.writeJsonCollection('apg.logs', [entry, ...rows]);
}

/**
 * Owner-only delete of audit_log rows whose timestamp is inside
 * [startIso, endIso]. On Supabase this is a single SQL DELETE; on sqlite we
 * fall back to the slow filter-and-rewrite path. Returns { deleted, remaining }.
 */
export async function deleteLogsInRange(scope, { startIso, endIso }) {
  if (useSupabase()) {
    const startMs = Date.parse(startIso);
    const endMs = Date.parse(endIso);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      throw new Error('startIso/endIso must be parseable timestamps');
    }
    const { deleted } = await supabaseStore.deleteAuditLogsInRange(scope, { startIso, endIso });
    return { deleted, remaining: null };
  }
  const all = await kvStore.readJsonCollection('apg.logs', []);
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  const kept = (Array.isArray(all) ? all : []).filter((entry) => {
    const ts = Date.parse(entry?.ts || '');
    if (!Number.isFinite(ts)) return true;
    return ts < startMs || ts > endMs;
  });
  await kvStore.writeJsonCollection('apg.logs', kept);
  return { deleted: all.length - kept.length, remaining: kept.length };
}

/**
 * Owner-only destructive delete of staff rows by staff_login_id. On Supabase
 * this hits the staff_users table directly (the upsert-only writeUsers path
 * cannot delete). On SQLite we fall back to read-filter-write of apg.users.
 *
 * Returns { deleted: string[], skipped: string[] } where `deleted` is the list
 * of staff_login_id values actually removed from the persistent store.
 */
export async function deleteStaffUsers(scope, ids = []) {
  const wanted = (Array.isArray(ids) ? ids : [])
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  if (!wanted.length) return { deleted: [], skipped: [] };
  if (useSupabase()) return supabaseStore.deleteStaffUsers(scope, wanted);
  const all = await kvStore.readJsonCollection('apg.users', []);
  const wantSet = new Set(wanted);
  const kept = (Array.isArray(all) ? all : []).filter((u) => !wantSet.has(String(u?.id || '').trim()));
  const removedSet = new Set(
    (Array.isArray(all) ? all : [])
      .map((u) => String(u?.id || '').trim())
      .filter((id) => id && wantSet.has(id)),
  );
  await kvStore.writeJsonCollection('apg.users', kept);
  const deleted = Array.from(removedSet);
  const skipped = wanted.filter((id) => !removedSet.has(id));
  return { deleted, skipped };
}

const SETTINGS_LOOKUP_KEYS = new Set([
  'plans',
  'statuses',
  'paymentMethods',
  'holdDurations',
  'genders',
  'expenseCategories',
  'exerciseTypes',
]);

/** Surgical add of one settings lookup value (owner-only at the route layer). */
export async function addSettingsLookup(scope, payload) {
  const category = String(payload?.category || '').trim();
  const value = String(payload?.value || '').trim();
  if (!SETTINGS_LOOKUP_KEYS.has(category)) throw new Error('invalid_lookup_category');
  if (!value) throw new Error('invalid_lookup_value');
  if (useSupabase()) return supabaseStore.addSettingsLookupValue(scope, { category, value });
  const settings = (await readJsonValue('apg.settings', {}, scope)) || {};
  const list = Array.isArray(settings[category]) ? settings[category] : [];
  if (!list.includes(value)) settings[category] = [...list, value];
  await writeJsonValue('apg.settings', settings, scope);
  return { ok: true, category, value };
}

/** Surgical delete of one settings lookup value (owner-only at the route layer). */
export async function writeRoleTemplates(scope, roleTemplates) {
  if (useSupabase()) return supabaseStore.writeRoleTemplatesValue(roleTemplates, scope);
  const settings = (await readJsonValue('apg.settings', {}, scope)) || {};
  settings.roleTemplates = Array.isArray(roleTemplates) ? roleTemplates : [];
  await writeJsonValue('apg.settings', settings, scope);
  return settings.roleTemplates;
}

export async function deleteSettingsLookup(scope, payload) {
  const category = String(payload?.category || '').trim();
  const value = String(payload?.value || '').trim();
  if (!SETTINGS_LOOKUP_KEYS.has(category)) throw new Error('invalid_lookup_category');
  if (!value) throw new Error('invalid_lookup_value');
  if (useSupabase()) return supabaseStore.deleteSettingsLookupValue(scope, { category, value });
  const settings = (await readJsonValue('apg.settings', {}, scope)) || {};
  const list = Array.isArray(settings[category]) ? settings[category] : [];
  settings[category] = list.filter((x) => x !== value);
  await writeJsonValue('apg.settings', settings, scope);
  return { ok: true, category, value, deleted: list.length - settings[category].length };
}

/** Surgical single-template save (owner-only at the route layer). */
export async function writeWhatsappTemplate(scope, payload) {
  const key = String(payload?.key || '').trim();
  if (!/^[a-z][a-zA-Z0-9_-]{0,63}$/.test(key)) {
    throw new Error('template key must match /^[a-z][a-zA-Z0-9_-]{0,63}$/');
  }
  const body = String(payload?.body == null ? '' : payload.body);
  if (body.length > 8000) throw new Error('template body exceeds 8000 chars');
  if (useSupabase()) return supabaseStore.upsertWhatsappTemplate(scope, { key, body });
  const settings = (await readJsonValue('apg.settings', {}, scope)) || {};
  const sms = settings.smsTemplates && typeof settings.smsTemplates === 'object' ? settings.smsTemplates : {};
  const nowIso = new Date().toISOString();
  settings.smsTemplates = { ...sms, [key]: body };
  await writeJsonValue('apg.settings', settings, scope);
  return { key, body, updatedAt: nowIso };
}

/** Surgical PT client profile save (staff + owner). */
export async function patchPtClientProfileValue(memberCode, profile, meta = {}) {
  if (useSupabase()) return supabaseStore.patchPtClientProfile(memberCode, profile, meta);
  const settings = (await readJsonValue('apg.settings', {}, null)) || {};
  const prevAll = settings.ptClientProfiles && typeof settings.ptClientProfiles === 'object'
    ? settings.ptClientProfiles
    : {};
  const code = String(memberCode || '').trim();
  const prev = prevAll[code] && typeof prevAll[code] === 'object' ? prevAll[code] : {};
  const nowIso = new Date().toISOString();
  const merged = {
    ...prev,
    ...(profile && typeof profile === 'object' ? profile : {}),
    updatedAt: nowIso,
    updatedBy: String(meta.updatedBy || profile?.updatedBy || '').trim() || prev.updatedBy || '',
  };
  settings.ptClientProfiles = { ...prevAll, [code]: merged };
  await writeJsonValue('apg.settings', settings, null);
  return merged;
}

export async function pingDataStore() {
  if (useSupabase()) {
    const sb = getSupabase();
    await initMembersTableName(sb);
    await membersBulkUpsertReady();
    await visitorsHaveGymCodeColumn(sb);
    return supabaseStore.ping();
  }
  await kvStore.readJsonCollection('apg.members', []);
  return true;
}
