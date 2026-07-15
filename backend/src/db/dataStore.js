import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { initMembersTableName } from './tables.js';
import * as kvStore from './kvStore.js';
import { getSupabase } from './supabase/client.js';
import { membersBulkUpsertReady } from './supabase/membersWrite.js';
import { visitorsHaveGymCodeColumn } from './supabase/visitorsSchema.js';
import * as supabaseStore from './supabase/repository.js';
import { mergeSettingsBulkPatch } from './supabase/settingsLookupLogic.js';
import { branchScopeAllowsMemberTransfer } from '../auth/branchScope.js';

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
  if (branchScope?.staffNoBranch) {
    filtered = [];
  } else if (branchScope?.gymCodeId) {
    const activeId = String(branchScope.gymCodeId);
    if (branchScope.isOwner) {
      filtered = sandboxed.filter((row) => {
        const bid = String(row?.assignedGymCodeId || '').trim();
        return !bid || bid === activeId;
      });
    } else {
      filtered = sandboxed.filter((row) => String(row?.assignedGymCodeId || '') === activeId);
    }
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
  if (key === 'apg.logs' && branchScope?.staffNoBranch) {
    filtered = [];
  } else if (key === 'apg.logs' && branchScope?.gymCodeId) {
    const activeId = String(branchScope.gymCodeId);
    filtered = filtered.filter((row) => {
      const bid = String(row?.branchId || '').trim();
      return !bid || bid === activeId;
    });
  }
  return filtered;
}

export async function readMember(memberCode, branchScope = null) {
  let member;
  if (useSupabase()) {
    member = await supabaseStore.readMemberByCode(memberCode, branchScope);
  } else {
    const rows = await kvStore.readJsonCollection('apg.members', []);
    const code = String(memberCode || '').trim();
    member = rows.find((m) => String(m?.memberId || '').trim() === code) || null;
    if (member && branchScope?.staffNoBranch) member = null;
    if (member && branchScope?.gymCodeId && String(member.assignedGymCodeId || '') !== String(branchScope.gymCodeId)) {
      member = null;
    }
  }
  if (!member) return null;
  return member;
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

export async function createMemberPayment(memberCode, input, branchScope = null) {
  if (useSupabase()) return supabaseStore.createMemberPayment(memberCode, input, branchScope);
  const rows = await kvStore.readJsonCollection('apg.members', []);
  const code = String(memberCode || '').trim();
  if (!code) {
    const err = new Error('member-code-required');
    err.status = 400;
    throw err;
  }
  if (!input || typeof input !== 'object') {
    const err = new Error('payment-required');
    err.status = 400;
    throw err;
  }
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('invalid-amount');
    err.status = 400;
    throw err;
  }
  const paidAt = String(input.paidAt || input.paid_at || '').trim();
  if (!paidAt) {
    const err = new Error('invalid-paid-at');
    err.status = 400;
    throw err;
  }
  const paidMonth = String(input.paidMonth || input.paid_month || '').trim();
  if (!paidMonth) {
    const err = new Error('invalid-paid-month');
    err.status = 400;
    throw err;
  }
  const idx = rows.findIndex((m) => String(m?.memberId || '').trim() === code);
  if (idx === -1) {
    const err = new Error('member-not-found');
    err.status = 404;
    throw err;
  }
  const hist = Array.isArray(rows[idx].paymentHistory) ? rows[idx].paymentHistory : [];
  const paymentId = String(input.paymentId || input.id || crypto.randomUUID()).trim();
  if (hist.some((p) => String(p?.id || '') === paymentId)) {
    const err = new Error('payment-already-exists');
    err.status = 409;
    throw err;
  }
  const recordedBy = String(input.recordedBy || input.recorded_by || input.by || '').trim();
  const newRow = {
    id: paymentId,
    paidAt,
    receivedAt: paidAt,
    amount,
    method: input.method != null ? String(input.method) : '',
    note: input.note != null ? String(input.note) : '',
    paidMonth,
    billingMonth: paidMonth,
    recordedBy,
    by: recordedBy,
    source: String(input.source || 'manual').trim(),
    createdAt: new Date().toISOString(),
  };
  const after = [...hist, newRow];
  const latestPaid = after
    .map((r) => String(r.paidAt || ''))
    .filter(Boolean)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || paidAt;
  rows[idx] = {
    ...rows[idx],
    payMonth: paidMonth,
    paymentHistory: after,
    paymentReceivedAt: latestPaid,
    updatedAt: new Date().toISOString(),
  };
  await kvStore.writeJsonCollection('apg.members', rows);
  return {
    ok: true,
    created: true,
    paymentId,
    payment: newRow,
    member: rows[idx],
  };
}

export async function updateMemberPayment(memberCode, paymentId, patch, branchScope = null) {
  if (useSupabase()) return supabaseStore.updateMemberPayment(memberCode, paymentId, patch, branchScope);
  const rows = await kvStore.readJsonCollection('apg.members', []);
  const code = String(memberCode || '').trim();
  const pid = String(paymentId || '').trim();
  if (!code || !pid) {
    const err = new Error('member-code-and-payment-id-required');
    err.status = 400;
    throw err;
  }
  if (!patch || typeof patch !== 'object') {
    const err = new Error('patch-required');
    err.status = 400;
    throw err;
  }
  const amount = Number(patch.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('invalid-amount');
    err.status = 400;
    throw err;
  }
  const paidAt = String(patch.paidAt || patch.paid_at || '').trim();
  if (!paidAt) {
    const err = new Error('invalid-paid-at');
    err.status = 400;
    throw err;
  }
  const paidMonth = String(patch.paidMonth || patch.paid_month || '').trim();
  if (!paidMonth) {
    const err = new Error('invalid-paid-month');
    err.status = 400;
    throw err;
  }
  const idx = rows.findIndex((m) => String(m?.memberId || '').trim() === code);
  if (idx === -1) {
    const err = new Error('member-not-found');
    err.status = 404;
    throw err;
  }
  const hist = Array.isArray(rows[idx].paymentHistory) ? rows[idx].paymentHistory : [];
  const payIdx = hist.findIndex((p) => String(p?.id || '') === pid);
  if (payIdx === -1) {
    const err = new Error('payment-not-found');
    err.status = 404;
    throw err;
  }
  const beforeRow = hist[payIdx];
  const afterRow = {
    ...beforeRow,
    paidAt,
    receivedAt: paidAt,
    amount,
    method: patch.method != null ? String(patch.method) : beforeRow.method,
    note: patch.note != null ? String(patch.note) : beforeRow.note,
    paidMonth,
    billingMonth: paidMonth,
    editedAt: new Date().toISOString(),
  };
  const after = hist.map((p, i) => (i === payIdx ? afterRow : p));
  rows[idx] = {
    ...rows[idx],
    payMonth: paidMonth,
    paymentHistory: after,
    updatedAt: new Date().toISOString(),
  };
  await kvStore.writeJsonCollection('apg.members', rows);
  return {
    ok: true,
    updated: true,
    paymentId: pid,
    payment: afterRow,
    member: rows[idx],
    before: beforeRow,
  };
}

export async function deleteMember(externalMemberCode, branchScope = null) {
  if (useSupabase()) return supabaseStore.deleteMemberByExternalId(externalMemberCode, branchScope);
  const rows = await kvStore.readJsonCollection('apg.members', []);
  const code = String(externalMemberCode || '').trim();
  const idx = rows.findIndex((m) => String(m?.memberId || '').trim() === code);
  if (idx === -1) {
    const err = new Error('member-not-found');
    err.status = 404;
    throw err;
  }
  if (branchScope?.gymCodeId) {
    const existing = String(rows[idx]?.assignedGymCodeId || '');
    if (branchScope.isOwner) {
      const activeId = String(branchScope.gymCodeId);
      const bid = existing.trim();
      if (bid && bid !== activeId) {
        const err = new Error('branch-write-forbidden');
        err.status = 403;
        throw err;
      }
    } else if (existing !== String(branchScope.gymCodeId)) {
      const err = new Error('branch-write-forbidden');
      err.status = 403;
      throw err;
    }
  }
  rows.splice(idx, 1);
  await kvStore.writeJsonCollection('apg.members', rows);
  return { ok: true, deleted: true, id: code };
}

export async function overrideMemberPaidForMonthAmount(
  memberCode,
  monthKey,
  newAmount,
  branchScope,
  meta = {},
) {
  if (useSupabase()) {
    return supabaseStore.overrideMemberPaidForMonthAmount(
      memberCode,
      monthKey,
      newAmount,
      branchScope,
      meta,
    );
  }
  const err = new Error('paid-for-month-override-requires-supabase');
  err.status = 501;
  throw err;
}

export async function deleteVisitor(externalVisitorId, branchScope = null) {
  if (useSupabase()) return supabaseStore.deleteVisitorByExternalId(externalVisitorId, branchScope);
  const rows = await kvStore.readJsonCollection('apg.visitors', []);
  const extId = String(externalVisitorId || '').trim();
  const idx = rows.findIndex((v) => String(v?.id || '').trim() === extId);
  if (idx === -1) {
    const err = new Error('visitor-not-found');
    err.status = 404;
    throw err;
  }
  if (branchScope?.gymCodeId) {
    const existing = String(rows[idx]?.assignedGymCodeId || '');
    if (existing !== String(branchScope.gymCodeId)) {
      const err = new Error('branch-write-forbidden');
      err.status = 403;
      throw err;
    }
  }
  rows.splice(idx, 1);
  await kvStore.writeJsonCollection('apg.visitors', rows);
  return { ok: true, id: extId };
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
  if (branchScope?.gymCodeId && !branchScope.isOwner) {
    const existing = String(rows[idx]?.assignedGymCodeId || '');
    if (existing !== String(branchScope.gymCodeId)) {
      const err = new Error('member-not-found');
      err.status = 404;
      throw err;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'assignedGymCodeId')) {
      const want = String(patch.assignedGymCodeId || '').trim();
      if (want && !branchScopeAllowsMemberTransfer(branchScope, existing, want)) {
        const err = new Error('cross-branch-write-forbidden');
        err.status = 403;
        throw err;
      }
    }
  }
  const targetBranch = Object.prototype.hasOwnProperty.call(patch, 'assignedGymCodeId')
    ? String(patch.assignedGymCodeId || '').trim()
    : String(rows[idx]?.assignedGymCodeId || '').trim();
  const sourceBranch = String(rows[idx]?.assignedGymCodeId || '').trim();
  let nextMemberId = String(rows[idx]?.memberId || '').trim();
  if (targetBranch && sourceBranch && targetBranch !== sourceBranch) {
    const formNo = Number(rows[idx]?.formNo || 0);
    if (Number.isFinite(formNo) && formNo > 0) {
      const hasConflict = rows.some((m, i) =>
        i !== idx
        && String(m?.assignedGymCodeId || '').trim() === targetBranch
        && Number(m?.formNo || 0) === formNo);
      if (hasConflict) {
        const baseCode = nextMemberId || String(memberCode || '').trim();
        let candidate = `${baseCode}-MOVED`;
        let n = 2;
        while (rows.some((m, i) => i !== idx && String(m?.memberId || '').trim() === candidate)) {
          candidate = `${baseCode}-MOVED${n}`;
          n += 1;
        }
        nextMemberId = candidate;
      }
    }
  }
  const next = { ...rows[idx], ...patch, memberId: nextMemberId, updatedAt: new Date().toISOString() };
  rows[idx] = next;
  await kvStore.writeJsonCollection('apg.members', rows);
  return next;
}

export async function writeJsonCollection(key, value, scope = null, options = null) {
  if (useSupabase()) return supabaseStore.writeCollection(key, value, scope, options);
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
  const mergeSettingsIfNeeded = async (storeKey, incoming) => {
    const existing = (await kvStore.readJsonValue(storeKey, {})) || {};
    const patch = incoming && typeof incoming === 'object' ? incoming : {};
    return mergeSettingsBulkPatch(existing, patch);
  };
  if (!scope) {
    if (key === 'apg.settings') {
      const merged = await mergeSettingsIfNeeded(key, value);
      return kvStore.writeJsonValue(key, merged);
    }
    return kvStore.writeJsonValue(key, value);
  }
  const sandboxKey = `apg.settings.sandbox.${scope.sandboxId}`;
  if (key === 'apg.settings') {
    const merged = await mergeSettingsIfNeeded(sandboxKey, value);
    return kvStore.writeJsonValue(sandboxKey, merged);
  }
  return kvStore.writeJsonValue(sandboxKey, value || {});
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

/** Returns branch-scoped WhatsApp templates as { gymCodeId, templates, updatedAt }. */
export async function readWhatsappTemplates(scope, gymCodeId) {
  if (useSupabase()) return supabaseStore.getWhatsappTemplates(scope, gymCodeId);
  const settings = (await readJsonValue('apg.settings', {}, scope)) || {};
  const sms = settings.smsTemplates && typeof settings.smsTemplates === 'object' ? settings.smsTemplates : {};
  return { gymCodeId: String(gymCodeId || ''), templates: { ...sms }, updatedAt: null };
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
 * Surgical audit log create with read-back verify (Supabase) or local append (SQLite).
 */
export async function createAuditLog(scope, entry, branchScope = null) {
  if (useSupabase()) return supabaseStore.createAuditLog(entry, branchScope);
  const id = String(entry?.id || crypto.randomUUID()).trim();
  const branchId = String(
    entry?.branchId || branchScope?.gymCodeId || branchScope?.allowedBranchIds?.[0] || '',
  ).trim();
  const stamped = {
    ...entry,
    id,
    branchId,
    ts: entry?.ts || new Date().toISOString(),
  };
  const rows = await kvStore.readJsonCollection('apg.logs', []);
  await kvStore.writeJsonCollection('apg.logs', [stamped, ...rows]);
  return { ok: true, created: true, log: stamped };
}

/** Full audit log row with before/after (not slim list projection). */
export async function readAuditLogById(scope, logId, branchScope = null) {
  const id = String(logId || '').trim();
  if (!id) return null;
  if (useSupabase()) return supabaseStore.readAuditLogById(id, scope, branchScope);
  const rows = await kvStore.readJsonCollection('apg.logs', []);
  const found = (Array.isArray(rows) ? rows : []).find((l) => String(l?.id || '') === id);
  return found || null;
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

export async function deleteLogsByIds(scope, ids = []) {
  const wanted = [...new Set((Array.isArray(ids) ? ids : []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (!wanted.length) return { deleted: 0, remaining: null };
  if (useSupabase()) {
    const { deleted } = await supabaseStore.deleteAuditLogsByIds(scope, wanted);
    return { deleted, remaining: null };
  }
  const rows = await kvStore.readJsonCollection('apg.logs', []);
  const wantSet = new Set(wanted);
  const kept = (Array.isArray(rows) ? rows : []).filter((r) => !wantSet.has(String(r?.id || '').trim()));
  await kvStore.writeJsonCollection('apg.logs', kept);
  return { deleted: rows.length - kept.length, remaining: kept.length };
}

/**
 * Owner-only destructive delete of staff rows by staff_login_id. On Supabase
 * this hits the staff_users table directly (the upsert-only writeUsers path
 * cannot delete). On SQLite we fall back to read-filter-write of apg.users.
 *
 * Returns { deleted: string[], skipped: string[] } where `deleted` is the list
 * of staff_login_id values actually removed from the persistent store.
 */
export async function deactivateStaffUsers(scope, ids = [], reason = '') {
  const wanted = (Array.isArray(ids) ? ids : [])
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  if (!wanted.length) return { deactivated: [], skipped: [] };
  if (useSupabase()) return supabaseStore.deactivateStaffUsers(scope, wanted, reason);
  const all = await kvStore.readJsonCollection('apg.users', []);
  const wantNorm = new Set(wanted.map((id) => id.toLowerCase()));
  const now = new Date().toISOString();
  const deactivated = [];
  const next = (Array.isArray(all) ? all : []).map((u) => {
    const id = String(u?.id || '').trim();
    if (!id || !wantNorm.has(id.toLowerCase())) return u;
    deactivated.push(id);
    return {
      ...u,
      blocked: true,
      blockedReason: String(reason || '').trim() || 'Deactivated',
      blockedAt: now,
      sections: [],
      access: {},
    };
  });
  if (deactivated.length) await kvStore.writeJsonCollection('apg.users', next);
  const deactivatedNorm = new Set(deactivated.map((id) => id.toLowerCase()));
  const skipped = wanted.filter((id) => !deactivatedNorm.has(id.toLowerCase()));
  return { deactivated, skipped };
}

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
  if (useSupabase()) {
    return supabaseStore.addSettingsLookupValue(scope, {
      category,
      value,
      createdByRole: payload?.createdByRole || null,
      createdByStaffLoginId: payload?.createdByStaffLoginId || null,
      createdByGymCodeId: payload?.createdByGymCodeId || null,
    });
  }
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
  if (useSupabase()) {
    return supabaseStore.deleteSettingsLookupValue(scope, {
      category,
      value,
      requesterRole: payload?.requesterRole || null,
      requesterStaffLoginId: payload?.requesterStaffLoginId || null,
      requesterGymCodeId: payload?.requesterGymCodeId || null,
    });
  }
  const settings = (await readJsonValue('apg.settings', {}, scope)) || {};
  const list = Array.isArray(settings[category]) ? settings[category] : [];
  settings[category] = list.filter((x) => x !== value);
  await writeJsonValue('apg.settings', settings, scope);
  return { ok: true, category, value, deleted: list.length - settings[category].length };
}

/** Surgical single-template save for one gym branch. */
export async function writeWhatsappTemplate(scope, payload) {
  const key = String(payload?.key || '').trim();
  const gymCodeId = String(payload?.gymCodeId || payload?.gym_code_id || '').trim();
  if (!gymCodeId) throw Object.assign(new Error('gym-code-id-required'), { status: 400 });
  if (!/^[a-z][a-zA-Z0-9_-]{0,63}$/.test(key)) {
    throw new Error('template key must match /^[a-z][a-zA-Z0-9_-]{0,63}$/');
  }
  const body = String(payload?.body == null ? '' : payload.body);
  if (body.length > 8000) throw new Error('template body exceeds 8000 chars');
  if (useSupabase()) return supabaseStore.upsertWhatsappTemplate(scope, { key, body, gymCodeId });
  const settings = (await readJsonValue('apg.settings', {}, scope)) || {};
  const sms = settings.smsTemplates && typeof settings.smsTemplates === 'object' ? settings.smsTemplates : {};
  const nowIso = new Date().toISOString();
  settings.smsTemplates = { ...sms, [key]: body };
  await writeJsonValue('apg.settings', settings, scope);
  return { key, body, updatedAt: nowIso, gymCodeId };
}

const LOCAL_CUSTOM_TEMPLATES_KEY = 'customTemplatesByBranch';

function readLocalCustomTemplatesMap(settings) {
  const map = settings?.[LOCAL_CUSTOM_TEMPLATES_KEY];
  return map && typeof map === 'object' ? map : {};
}

function writeLocalCustomTemplatesMap(settings, map) {
  return { ...settings, [LOCAL_CUSTOM_TEMPLATES_KEY]: map };
}

/** Branch-scoped custom templates list. */
export async function readCustomTemplates(scope, gymCodeId, options = {}) {
  if (useSupabase()) {
    const { listBranchCustomTemplates } = await import('../services/branchCustomTemplates.js');
    return listBranchCustomTemplates(gymCodeId, options);
  }
  const settings = (await readJsonValue('apg.settings', {}, scope)) || {};
  const branchId = String(gymCodeId || '').trim();
  const map = readLocalCustomTemplatesMap(settings);
  const list = Array.isArray(map[branchId]) ? map[branchId] : [];
  const featureEnabled = settings.customTemplatesEnabled === true;
  const includeArchived = options.includeArchived === true;
  const templates = list.filter((t) => includeArchived || (t.isActive !== false && t.status !== 'archived'));
  return {
    gymCodeId: branchId,
    featureEnabled,
    templates: featureEnabled ? templates : [],
  };
}

export async function createCustomTemplate(scope, payload, meta = {}) {
  if (useSupabase()) {
    const { createBranchCustomTemplate } = await import('../services/branchCustomTemplates.js');
    const created = await createBranchCustomTemplate(payload?.gymCodeId, payload, meta);
    const { notifyCollectionChange } = await import('../realtime/supabaseListener.js');
    notifyCollectionChange('customTemplates');
    return created;
  }
  const settings = (await readJsonValue('apg.settings', {}, scope)) || {};
  if (settings.customTemplatesEnabled !== true) {
    throw Object.assign(new Error('custom-templates-feature-disabled'), { status: 403 });
  }
  const branchId = String(payload?.gymCodeId || '').trim();
  if (!branchId) throw Object.assign(new Error('gym-code-id-required'), { status: 400 });
  const nowIso = new Date().toISOString();
  const template = {
    id: crypto.randomUUID(),
    gymCodeId: branchId,
    templateCode: String(payload?.templateCode || '').trim(),
    templateName: String(payload?.templateName || '').trim(),
    templateType: String(payload?.templateType || 'promotional'),
    messageBody: String(payload?.messageBody || ''),
    channel: String(payload?.channel || 'whatsapp'),
    isActive: true,
    status: 'active',
    createdBy: String(meta?.createdBy || '').trim() || null,
    createdAt: nowIso,
    updatedAt: nowIso,
    sortOrder: Number(payload?.sortOrder || 0),
  };
  const map = readLocalCustomTemplatesMap(settings);
  const list = Array.isArray(map[branchId]) ? [...map[branchId]] : [];
  list.push(template);
  await writeJsonValue('apg.settings', writeLocalCustomTemplatesMap(settings, { ...map, [branchId]: list }), scope);
  return template;
}

export async function updateCustomTemplate(scope, templateId, payload) {
  if (useSupabase()) {
    const { updateBranchCustomTemplate } = await import('../services/branchCustomTemplates.js');
    const result = await updateBranchCustomTemplate(templateId, payload?.gymCodeId, payload);
    const { notifyCollectionChange } = await import('../realtime/supabaseListener.js');
    notifyCollectionChange('customTemplates');
    return result;
  }
  const settings = (await readJsonValue('apg.settings', {}, scope)) || {};
  if (settings.customTemplatesEnabled !== true) {
    throw Object.assign(new Error('custom-templates-feature-disabled'), { status: 403 });
  }
  const branchId = String(payload?.gymCodeId || '').trim();
  const id = String(templateId || '').trim();
  const map = readLocalCustomTemplatesMap(settings);
  const list = Array.isArray(map[branchId]) ? [...map[branchId]] : [];
  const idx = list.findIndex((t) => String(t?.id || '') === id);
  if (idx < 0) throw Object.assign(new Error('custom-template-not-found'), { status: 404 });
  const before = { ...list[idx] };
  const nowIso = new Date().toISOString();
  const next = { ...list[idx], updatedAt: nowIso };
  if (payload?.templateName != null) next.templateName = String(payload.templateName);
  if (payload?.messageBody != null) next.messageBody = String(payload.messageBody);
  if (payload?.templateType != null) next.templateType = String(payload.templateType);
  if (payload?.channel != null) next.channel = String(payload.channel);
  if (payload?.status != null) next.status = String(payload.status);
  if (payload?.isActive != null) next.isActive = Boolean(payload.isActive);
  if (payload?.sortOrder != null) next.sortOrder = Number(payload.sortOrder);
  list[idx] = next;
  await writeJsonValue('apg.settings', writeLocalCustomTemplatesMap(settings, { ...map, [branchId]: list }), scope);
  return { template: next, before };
}

export async function archiveCustomTemplate(scope, templateId, gymCodeId) {
  if (useSupabase()) {
    const { archiveBranchCustomTemplate } = await import('../services/branchCustomTemplates.js');
    const result = await archiveBranchCustomTemplate(templateId, gymCodeId);
    const { notifyCollectionChange } = await import('../realtime/supabaseListener.js');
    notifyCollectionChange('customTemplates');
    return result;
  }
  return updateCustomTemplate(scope, templateId, {
    gymCodeId,
    isActive: false,
    status: 'archived',
  });
}

export async function deleteCustomTemplate(scope, templateId, gymCodeId) {
  if (useSupabase()) {
    const { deleteBranchCustomTemplate } = await import('../services/branchCustomTemplates.js');
    const result = await deleteBranchCustomTemplate(templateId, gymCodeId);
    const { notifyCollectionChange } = await import('../realtime/supabaseListener.js');
    notifyCollectionChange('customTemplates');
    return result;
  }
  const settings = (await readJsonValue('apg.settings', {}, scope)) || {};
  if (settings.customTemplatesEnabled !== true) {
    throw Object.assign(new Error('custom-templates-feature-disabled'), { status: 403 });
  }
  const branchId = String(gymCodeId || '').trim();
  const id = String(templateId || '').trim();
  const map = readLocalCustomTemplatesMap(settings);
  const list = Array.isArray(map[branchId]) ? [...map[branchId]] : [];
  const idx = list.findIndex((t) => String(t?.id || '') === id);
  if (idx < 0) throw Object.assign(new Error('custom-template-not-found'), { status: 404 });
  const before = { ...list[idx] };
  list.splice(idx, 1);
  await writeJsonValue('apg.settings', writeLocalCustomTemplatesMap(settings, { ...map, [branchId]: list }), scope);
  return {
    deletedId: id,
    templateCode: String(before?.templateCode || ''),
    gymCodeId: branchId,
    before,
  };
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

/** Server-verified finance totals from payment_transaction_date (paid_at) + manual rows. */
export async function readFinanceSummary(branchScope, options = {}) {
  if (useSupabase()) return supabaseStore.readFinanceSummary(branchScope, options);

  const {
    buildMonthSummaryFromRecords,
    buildYearReconciliationFromRecords,
  } = await import('../services/financeSummaryService.js');
  const { calendarMonthPaidAtBounds, paymentInCalendarMonth } = await import('../../src/features/finance/paymentCalendarMonth.js');

  const members = await readJsonCollection('apg.members', [], null, branchScope);
  const financeRows = await kvStore.readJsonCollection('apg.finance', []);
  const settings = (await kvStore.readJsonValue('apg.settings', {}, null)) || {};

  const paymentRecords = [];
  for (const m of members) {
    const hist = Array.isArray(m.paymentHistory) ? m.paymentHistory : [];
    for (const h of hist) {
      paymentRecords.push({
        id: h.id,
        memberId: m.memberId,
        memberName: m.name || '',
        paidAt: h.paidAt || h.receivedAt || h.date,
        amount: Number(h.amount || 0),
        method: h.method || h.paymentMethod || '',
      });
    }
  }

  if (options.year) {
    const year = Number(options.year);
    return {
      year,
      dateBasis: 'payment_transaction_date_utc_calendar',
      totalPaymentsInYear: paymentRecords.length,
      months: buildYearReconciliationFromRecords(paymentRecords, financeRows, year, settings),
    };
  }

  const monthKey = String(options.month || '').trim();
  if (!calendarMonthPaidAtBounds(monthKey)) {
    const err = new Error('invalid_month');
    err.status = 400;
    throw err;
  }
  return {
    ...buildMonthSummaryFromRecords(
      paymentRecords,
      financeRows,
      monthKey,
      settings,
      Boolean(options.includeLines),
    ),
    dbPaymentRowsInRange: paymentRecords.filter((p) =>
      paymentInCalendarMonth(p.paidAt, monthKey)).length,
    scopedMemberCount: members.length,
  };
}

/** Single expense row upsert (Supabase row API; KV append/replace). */
export async function upsertFinanceExpenseRow(expenseRow) {
  if (useSupabase()) return supabaseStore.upsertFinanceExpenseRow(expenseRow);
  const amount = Number(expenseRow?.amount || 0);
  if (!amount || amount <= 0) {
    const err = new Error('invalid-amount');
    err.status = 400;
    throw err;
  }
  if (!String(expenseRow?.note || '').trim()) {
    const err = new Error('note-required');
    err.status = 400;
    throw err;
  }
  const rows = await kvStore.readJsonCollection('apg.finance', []);
  const id = String(expenseRow?.id || crypto.randomUUID());
  const nextRow = {
    ...expenseRow,
    id,
    type: 'expense',
    source: expenseRow?.source || 'manual',
    status: expenseRow?.status || 'posted',
  };
  const kept = rows.filter((r) => String(r?.id || '') !== id);
  await kvStore.writeJsonCollection('apg.finance', [nextRow, ...kept]);
  return nextRow;
}

/** Delete expense by client id / external_tx_id. */
export async function deleteFinanceExpenseRow(externalTxId) {
  if (useSupabase()) return supabaseStore.deleteFinanceExpenseRow(externalTxId);
  const id = String(externalTxId || '').trim();
  if (!id) {
    const err = new Error('expense-id-required');
    err.status = 400;
    throw err;
  }
  const rows = await kvStore.readJsonCollection('apg.finance', []);
  const next = rows.filter((r) => !(String(r?.id || '') === id && r?.type === 'expense'));
  if (next.length === rows.length) {
    const err = new Error('expense-not-found');
    err.status = 404;
    throw err;
  }
  await kvStore.writeJsonCollection('apg.finance', next);
  return { ok: true, id };
}

/** Attendance structured notes (Supabase only). */
export async function createAttendanceNote(auth, body) {
  if (!useSupabase()) {
    throw Object.assign(new Error('attendance-notes-supabase-only'), { status: 503 });
  }
  const { createAttendanceNoteForAuth } = await import('../services/attendance/attendanceNotesService.js');
  return createAttendanceNoteForAuth(auth, body);
}

export async function listAttendanceNotes(auth, query) {
  if (!useSupabase()) return [];
  const { listAttendanceNotesForAuth } = await import('../services/attendance/attendanceNotesService.js');
  return listAttendanceNotesForAuth(auth, query);
}

export async function latestAttendanceNote(auth, query) {
  if (!useSupabase()) return null;
  const { latestAttendanceNoteForAuth } = await import('../services/attendance/attendanceNotesService.js');
  return latestAttendanceNoteForAuth(auth, query);
}

export async function cleanupExpiredAttendanceNotes() {
  if (!useSupabase()) return { deleted: 0 };
  const { cleanupExpiredAttendanceNotesForGym } = await import('../services/attendance/attendanceNotesService.js');
  return cleanupExpiredAttendanceNotesForGym();
}

export async function readStaffAttendanceSelfToday(scope, userId) {
  if (!useSupabase()) return null;
  const { readStaffAttendanceForUserToday } = await import('./supabase/repository.js');
  return readStaffAttendanceForUserToday(scope, userId);
}
