import crypto from 'node:crypto';
import { ALL_SECTIONS } from '../../../../src/features/access/permissions.js';
import { isPtPlanName } from '../../../../src/features/pt/ptEligibility.js';
import { invalidateStaffAccessCache } from '../../auth/accessControl.js';
import { memberPhotoStorageEnabled } from '../../services/memberPhoto/storageConstants.js';
import { enrichStaffUsersWithPhotoUrls } from '../../services/staffPhoto/StaffPhotoService.js';
import {
  resolvePaidMonthForPayment,
  validatePaidMonthKey,
  payMonthKeyFromStoredValue,
} from '../../../../src/features/finance/derivePaidMonth.js';
import { T, LOOKUP_CATEGORIES } from '../tables.js';
import { notifyCollectionChange } from '../../realtime/supabaseListener.js';
import { getSupabase, gymId } from './client.js';
import {
  appFinanceToRow,
  appLogToRow,
  appMemberToRow,
  appSmsToRow,
  appStaffToRow,
  appVisitorToRow,
  attachmentRowToApp,
  financeRowToApp,
  logRowToApp,
  memberRowToApp,
  MEMBER_LIST_COLUMNS,
  LOG_LIST_COLUMNS,
  messageRowToApp,
  paymentRowToApp,
  smsRowToApp,
  staffRowToApp,
  visitorRowToApp,
} from './mappers.js';
import { leaveDaysFromDateRange } from './leaveRequestsWrite.js';
import { branchScopeAllowsMember, branchScopeAllowsMemberTransfer } from '../../auth/branchScope.js';
import { hashPassword } from '../../auth/passwords.js';
import { syncGymRowsByExternalId, syncMemberChildRows } from './collectionSync.js';
import {
  syncMemberPaidForMonthLedger,
  upsertMembershipPayMonthRow,
  memberPaidForMonthLedgerReady,
  mapPaidForMonthLedgerToPaymentRecords,
  sumActivePaidForMonthLedger,
  sumPaidForMonthLedger,
  patchMemberPaidForMonthAmount,
  readMemberPaidForMonthLedgerRow,
} from './memberPaidForMonthSync.js';
import { bulkUpsertMemberRows, membersBulkUpsertReady } from './membersWrite.js';
import {
  applyActiveMembersFilter,
  filterMembersBlockedFromBulkWrite,
  loadBlockedMemberCodes,
  recordMemberDeleteAudit,
} from './memberDeleteGuard.js';
import { updateStaffUserRow } from './staffUsersWrite.js';
import { paymentHistoryListMonthsBack, paymentHistoryListSinceIso } from './memberPaymentsListWindow.js';
import {
  chunk,
  emptyText,
  fetchAll,
  isMissingDbTableError,
  paymentBillingDate,
  toDate,
  toTs,
} from './utils.js';
import { stripVisitorGymCodeColumn, visitorsHaveGymCodeColumn } from './visitorsSchema.js';
import { syncStaffUserAccess, syncStaffUserSections } from './staffUserSync.js';
import {
  paymentHistoryCanonicalDedupeKey,
  paymentRowMatchesId,
  stablePaymentHistoryRowId,
} from './paymentIds.js';
import {
  applySettingsConfigJson,
  preserveNonEmptyLookups,
  shouldSkipLookupCategorySync,
} from './settingsLookupLogic.js';
import { settingsScopeFlags } from './settingsScope.js';
import { applySettingsBranchFilter } from './settingsBranchFilter.js';
import {
  dedupeRoleTemplates,
  mergeSettingsPreservingRoleTemplates,
  roleTemplateRowToApp,
  roleTemplateTitleKey,
  roleTemplateToRow,
} from './roleTemplateLogic.js';

const KEY_MEMBERS = 'apg.members';
const KEY_USERS = 'apg.users';
const KEY_SETTINGS = 'apg.settings';
const KEY_VISITORS = 'apg.visitors';
const KEY_LOGS = 'apg.logs';
const KEY_FINANCE = 'apg.finance';
const KEY_SMS = 'apg.sms.events';

function sandboxFilter(rows, scope) {
  if (!scope) return rows;
  return rows.filter((row) => String(row?.sandboxId || '') === scope.sandboxId);
}

async function loadMemberChildren(sb, gid, memberIds) {
  const paymentsByMember = new Map();
  const messagesByMember = new Map();
  const attachmentsByMember = new Map();
  const injuryByMember = new Map();

  if (!memberIds.length) {
    return { paymentsByMember, messagesByMember, attachmentsByMember, injuryByMember };
  }

  for (const idChunk of chunk(memberIds, 100)) {
    const [payRes, msgRes, attRes, injRes] = await Promise.all([
      sb.from(T.member_payment_history).select('*').eq('gym_id', gid).in('member_id', idChunk),
      sb.from(T.member_message_history).select('*').eq('gym_id', gid).in('member_id', idChunk),
      sb.from(T.member_attachments).select('*').eq('gym_id', gid).in('member_id', idChunk),
      sb.from(T.member_injury_notes).select('*').eq('gym_id', gid).in('member_id', idChunk),
    ]);
    if (payRes.error) throw payRes.error;
    if (msgRes.error) throw msgRes.error;
    if (attRes.error) throw attRes.error;
    if (injRes.error) throw injRes.error;

    for (const row of payRes.data || []) {
      const list = paymentsByMember.get(row.member_id) || [];
      list.push(paymentRowToApp(row));
      paymentsByMember.set(row.member_id, list);
    }
    for (const row of msgRes.data || []) {
      const list = messagesByMember.get(row.member_id) || [];
      list.push(messageRowToApp(row));
      messagesByMember.set(row.member_id, list);
    }
    for (const row of attRes.data || []) {
      const list = attachmentsByMember.get(row.member_id) || [];
      list.push(attachmentRowToApp(row));
      attachmentsByMember.set(row.member_id, list);
    }
    for (const row of injRes.data || []) {
      const list = injuryByMember.get(row.member_id) || [];
      list.push({
        id: row.external_note_id || String(row.id),
        text: row.note_text,
        note: row.note_text,
        by: row.created_by,
        at: row.created_at,
        createdAt: row.created_at,
        ts: row.created_at,
      });
      injuryByMember.set(row.member_id, list);
    }
  }

  return { paymentsByMember, messagesByMember, attachmentsByMember, injuryByMember };
}

/** Payment rows for list hydrate — bounded by APG_PAYMENT_HISTORY_LIST_MONTHS_BACK (default 84). */
async function loadMemberPaymentsForList(sb, gid, memberIds, monthsBack) {
  const paymentsByMember = new Map();
  if (!memberIds.length) return paymentsByMember;
  const back = Number.isFinite(monthsBack) && monthsBack > 0
    ? Math.floor(monthsBack)
    : paymentHistoryListMonthsBack();
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - back);
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);
  const sinceIso = since.toISOString();
  for (const idChunk of chunk(memberIds, 100)) {
    const { data, error } = await sb
      .from(T.member_payment_history)
      .select('member_id, paid_at, amount, external_payment_id, method, billing_month, billing_date, paid_month, source, recorded_by, note')
      .eq('gym_id', gid)
      .in('member_id', idChunk)
      .gte('paid_at', sinceIso);
    if (error) throw error;
    for (const row of data || []) {
      const list = paymentsByMember.get(row.member_id) || [];
      list.push(paymentRowToApp(row));
      paymentsByMember.set(row.member_id, list);
    }
  }
  return paymentsByMember;
}

async function readMemberByCode(memberCode, branchScope = null) {
  if (branchScope?.staffNoBranch) {
    return null;
  }
  const sb = getSupabase();
  const gid = gymId();
  const code = String(memberCode || '').trim();
  if (!code) return null;
  let q = applyActiveMembersFilter(
    sb.from(T.members).select('*').eq('gym_id', gid).eq('member_code', code),
  );
  if (branchScope?.gymCodeId) {
    q = q.eq('assigned_gym_code_id', branchScope.gymCodeId);
  }
  const { data: rows, error } = await q.order('updated_at', { ascending: false }).limit(1);
  if (error) throw new Error(`member lookup: ${error.message}`);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row || row.deleted_at) return null;
  const children = await loadMemberChildren(sb, gid, [row.id]);
  const app = memberRowToApp(row, {
    payments: children.paymentsByMember.get(row.id) || [],
    messages: children.messagesByMember.get(row.id) || [],
    attachments: children.attachmentsByMember.get(row.id) || [],
    injuryNotes: children.injuryByMember.get(row.id) || [],
  });
  const { memberPhotoStorageEnabled } = await import('../../services/memberPhoto/storageConstants.js');
  if (memberPhotoStorageEnabled()) {
    const { enrichMemberPhotoFromDbRow } = await import('../../services/memberPhoto/MemberPhotoService.js');
    return enrichMemberPhotoFromDbRow(app, row);
  }
  return app;
}

/**
 * Surgical payment-row delete — syncs member_payment_history for one member only.
 * Returns 404 when no row matches paymentId (stable sig: or external id).
 */
export async function deleteMemberPayment(memberCode, paymentId, branchScope = null) {
  const code = String(memberCode || '').trim();
  const pid = String(paymentId || '').trim();
  if (!code || !pid) {
    const err = new Error('member-code-and-payment-id-required');
    err.status = 400;
    throw err;
  }

  const member = await readMemberByCode(code, branchScope);
  if (!member) {
    const err = new Error('member-not-found');
    err.status = 404;
    throw err;
  }

  const before = Array.isArray(member.paymentHistory) ? member.paymentHistory : [];
  const removed = before.find((p) => paymentRowMatchesId(p, code, pid));
  if (!removed) {
    const err = new Error('payment-not-found');
    err.status = 404;
    throw err;
  }

  const removedCanon = paymentHistoryCanonicalDedupeKey(removed);
  const after = before.filter((p) => {
    if (paymentRowMatchesId(p, code, pid)) return false;
    if (removedCanon && paymentHistoryCanonicalDedupeKey(p) === removedCanon) return false;
    return true;
  });
  const sb = getSupabase();
  const gid = gymId();
  const { data: memberRow, error: rowErr } = await sb
    .from(T.members)
    .select('id')
    .eq('gym_id', gid)
    .eq('member_code', code)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (rowErr) throw new Error(`member pk lookup: ${rowErr.message}`);
  if (!memberRow?.id) {
    const err = new Error('member-not-found');
    err.status = 404;
    throw err;
  }

  const { payRows } = buildMemberChildRows({ memberId: code, paymentHistory: after }, gid, memberRow.id);
  await syncMemberChildRows(sb, T.member_payment_history, {
    gymId: gid,
    memberId: memberRow.id,
    externalIdColumn: 'external_payment_id',
    rows: payRows,
    onConflict: 'gym_id,member_id,external_payment_id',
  });

  try {
    await syncMemberPaidForMonthLedger(sb, {
      gymId: gid,
      memberPk: memberRow.id,
      member: { memberId: code, paymentHistory: after },
    });
  } catch (ledgerErr) {
    const msg = String(ledgerErr?.message || ledgerErr);
    if (!/member_paid_for_month|does not exist|42P01/i.test(msg)) throw ledgerErr;
  }

  notifyCollectionChange('members');
  const refreshed = await readMemberByCode(code, branchScope);
  const stillPresent = (refreshed?.paymentHistory || []).some((p) => paymentRowMatchesId(p, code, pid)
    || (removedCanon && paymentHistoryCanonicalDedupeKey(p) === removedCanon));
  if (stillPresent) {
    const err = new Error('payment-delete-not-persisted');
    err.status = 500;
    throw err;
  }
  return { ok: true, deleted: true, paymentId: pid, member: refreshed };
}

/**
 * Surgical payment-row create — appends one member_payment_history row from DB-complete history.
 * Verifies read-back before returning success (no debounced bulk sync).
 */
export async function createMemberPayment(memberCode, input, branchScope = null) {
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

  const paidAt = toTs(input.paidAt || input.paid_at);
  if (!paidAt) {
    const err = new Error('invalid-paid-at');
    err.status = 400;
    throw err;
  }

  const paidMonth = validatePaidMonthKey(input.paidMonth)
    || validatePaidMonthKey(input.paid_month);
  if (!paidMonth) {
    const err = new Error('invalid-paid-month');
    err.status = 400;
    throw err;
  }

  const method = emptyText(input.method);
  const note = emptyText(input.note);
  const recordedBy = emptyText(input.recordedBy || input.recorded_by || input.by);

  const member = await readMemberByCode(code, branchScope);
  if (!member) {
    const err = new Error('member-not-found');
    err.status = 404;
    throw err;
  }

  const before = Array.isArray(member.paymentHistory) ? member.paymentHistory : [];
  const billingDateForRow = String(member.billingDate || '').trim()
    || paymentBillingDate({ paidAt, billingMonth: paidMonth });
  const createdAt = new Date().toISOString();
  const rowDraft = {
    paidAt,
    receivedAt: paidAt,
    amount,
    method,
    note,
    paidMonth,
    billingMonth: paidMonth,
    billingDate: billingDateForRow,
    recordedBy,
    by: recordedBy,
    source: emptyText(input.source) || 'manual',
    createdAt,
  };
  const paymentId = String(input.paymentId || input.id || '').trim()
    || stablePaymentHistoryRowId(rowDraft, code)
    || crypto.randomUUID();

  if (before.some((p) => paymentRowMatchesId(p, code, paymentId))) {
    const err = new Error('payment-already-exists');
    err.status = 409;
    throw err;
  }

  const newCanon = paymentHistoryCanonicalDedupeKey(rowDraft);
  if (newCanon && before.some((p) => paymentHistoryCanonicalDedupeKey(p) === newCanon)) {
    const err = new Error('payment-duplicate');
    err.status = 409;
    throw err;
  }

  const newRow = { ...rowDraft, id: paymentId };
  const after = [...before, newRow].sort((a, b) => {
    const ta = Date.parse(String(a?.paidAt || a?.receivedAt || '')) || 0;
    const tb = Date.parse(String(b?.paidAt || b?.receivedAt || '')) || 0;
    return tb - ta;
  });

  const sb = getSupabase();
  const gid = gymId();
  const { data: memberRow, error: rowErr } = await sb
    .from(T.members)
    .select('id')
    .eq('gym_id', gid)
    .eq('member_code', code)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (rowErr) throw new Error(`member pk lookup: ${rowErr.message}`);
  if (!memberRow?.id) {
    const err = new Error('member-not-found');
    err.status = 404;
    throw err;
  }

  const latestPaid = after
    .map((r) => String(r.paidAt || r.receivedAt || ''))
    .filter(Boolean)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || paidAt;

  const memberForChildRows = {
    memberId: code,
    payMonth: paidMonth,
    paymentHistory: after,
    paymentReceivedAt: latestPaid,
  };
  const { payRows } = buildMemberChildRows(memberForChildRows, gid, memberRow.id);
  await syncMemberChildRows(sb, T.member_payment_history, {
    gymId: gid,
    memberId: memberRow.id,
    externalIdColumn: 'external_payment_id',
    rows: payRows,
    onConflict: 'gym_id,member_id,external_payment_id',
  });

  try {
    await syncMemberPaidForMonthLedger(sb, {
      gymId: gid,
      memberPk: memberRow.id,
      member: memberForChildRows,
    });
  } catch (ledgerErr) {
    const msg = String(ledgerErr?.message || ledgerErr);
    if (!/member_paid_for_month|does not exist|42P01/i.test(msg)) throw ledgerErr;
  }

  const { error: memberUpdErr } = await sb
    .from(T.members)
    .update({
      pay_month: emptyText(paidMonth),
      updated_at: createdAt,
    })
    .eq('id', memberRow.id);
  if (memberUpdErr) throw new Error(`member pay_month update: ${memberUpdErr.message}`);

  notifyCollectionChange('members');
  const refreshed = await readMemberByCode(code, branchScope);
  const createdPayment = (refreshed?.paymentHistory || []).find((p) => paymentRowMatchesId(p, code, paymentId));
  if (!createdPayment) {
    const err = new Error('payment-create-not-persisted');
    err.status = 500;
    throw err;
  }

  const persistedAmount = Number(createdPayment.amount || 0);
  const persistedPaidMonth = validatePaidMonthKey(createdPayment.paidMonth)
    || validatePaidMonthKey(createdPayment.billingMonth);
  const persistedPaidAt = toTs(createdPayment.paidAt || createdPayment.receivedAt);
  const amountOk = Math.abs(persistedAmount - amount) < 0.01;
  const monthOk = persistedPaidMonth === paidMonth;
  const dateOk = persistedPaidAt && paidAt
    && String(persistedPaidAt).slice(0, 10) === String(paidAt).slice(0, 10);
  if (!amountOk || !monthOk || !dateOk) {
    const err = new Error('payment-create-not-persisted');
    err.status = 500;
    err.detail = {
      expected: { amount, paidMonth, paidAt: String(paidAt).slice(0, 10) },
      persisted: {
        amount: persistedAmount,
        paidMonth: persistedPaidMonth,
        paidAt: persistedPaidAt ? String(persistedPaidAt).slice(0, 10) : null,
      },
    };
    throw err;
  }

  return {
    ok: true,
    created: true,
    paymentId,
    payment: createdPayment,
    member: refreshed,
  };
}

/**
 * Surgical payment-row update — upserts one member_payment_history row and resyncs ledger.
 * Returns 404 when no row matches paymentId. Verifies read-back before returning success.
 */
export async function updateMemberPayment(memberCode, paymentId, patch, branchScope = null) {
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

  const paidAt = toTs(patch.paidAt || patch.paid_at);
  if (!paidAt) {
    const err = new Error('invalid-paid-at');
    err.status = 400;
    throw err;
  }

  const paidMonth = validatePaidMonthKey(patch.paidMonth)
    || validatePaidMonthKey(patch.paid_month);
  if (!paidMonth) {
    const err = new Error('invalid-paid-month');
    err.status = 400;
    throw err;
  }

  const method = emptyText(patch.method);
  const note = emptyText(patch.note);

  const member = await readMemberByCode(code, branchScope);
  if (!member) {
    const err = new Error('member-not-found');
    err.status = 404;
    throw err;
  }

  const before = Array.isArray(member.paymentHistory) ? member.paymentHistory : [];
  const beforeIdx = before.findIndex((p) => paymentRowMatchesId(p, code, pid));
  if (beforeIdx === -1) {
    const err = new Error('payment-not-found');
    err.status = 404;
    throw err;
  }

  const beforeRow = before[beforeIdx];
  const billingDateForRow = String(beforeRow.billingDate || '').trim()
    || paymentBillingDate(beforeRow);
  const editedAt = new Date().toISOString();
  const afterRow = {
    ...beforeRow,
    paidAt,
    receivedAt: paidAt,
    amount,
    method,
    note,
    paidMonth,
    billingMonth: paidMonth,
    billingDate: billingDateForRow,
    editedBy: emptyText(patch.editedBy || beforeRow.editedBy),
    editedAt,
  };
  const after = before.map((p, i) => (i === beforeIdx ? afterRow : p));

  const sb = getSupabase();
  const gid = gymId();
  const { data: memberRow, error: rowErr } = await sb
    .from(T.members)
    .select('id')
    .eq('gym_id', gid)
    .eq('member_code', code)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (rowErr) throw new Error(`member pk lookup: ${rowErr.message}`);
  if (!memberRow?.id) {
    const err = new Error('member-not-found');
    err.status = 404;
    throw err;
  }

  const memberForChildRows = {
    memberId: code,
    payMonth: paidMonth,
    paymentHistory: after,
  };
  const { payRows } = buildMemberChildRows(memberForChildRows, gid, memberRow.id);
  await syncMemberChildRows(sb, T.member_payment_history, {
    gymId: gid,
    memberId: memberRow.id,
    externalIdColumn: 'external_payment_id',
    rows: payRows,
    onConflict: 'gym_id,member_id,external_payment_id',
  });

  try {
    await syncMemberPaidForMonthLedger(sb, {
      gymId: gid,
      memberPk: memberRow.id,
      member: memberForChildRows,
    });
  } catch (ledgerErr) {
    const msg = String(ledgerErr?.message || ledgerErr);
    if (!/member_paid_for_month|does not exist|42P01/i.test(msg)) throw ledgerErr;
  }

  const { error: memberUpdErr } = await sb
    .from(T.members)
    .update({
      pay_month: emptyText(paidMonth),
      updated_at: editedAt,
    })
    .eq('id', memberRow.id);
  if (memberUpdErr) throw new Error(`member pay_month update: ${memberUpdErr.message}`);

  notifyCollectionChange('members');
  const refreshed = await readMemberByCode(code, branchScope);
  const updatedPayment = (refreshed?.paymentHistory || []).find((p) => paymentRowMatchesId(p, code, pid));
  if (!updatedPayment) {
    const err = new Error('payment-update-not-persisted');
    err.status = 500;
    throw err;
  }

  const persistedAmount = Number(updatedPayment.amount || 0);
  const persistedPaidMonth = validatePaidMonthKey(updatedPayment.paidMonth)
    || validatePaidMonthKey(updatedPayment.billingMonth);
  const persistedPaidAt = toTs(updatedPayment.paidAt || updatedPayment.receivedAt);
  const amountOk = Math.abs(persistedAmount - amount) < 0.01;
  const monthOk = persistedPaidMonth === paidMonth;
  const dateOk = persistedPaidAt && paidAt
    && String(persistedPaidAt).slice(0, 10) === String(paidAt).slice(0, 10);
  if (!amountOk || !monthOk || !dateOk) {
    const err = new Error('payment-update-not-persisted');
    err.status = 500;
    err.detail = {
      expected: { amount, paidMonth, paidAt: String(paidAt).slice(0, 10) },
      persisted: {
        amount: persistedAmount,
        paidMonth: persistedPaidMonth,
        paidAt: persistedPaidAt ? String(persistedPaidAt).slice(0, 10) : null,
      },
    };
    throw err;
  }

  return {
    ok: true,
    updated: true,
    paymentId: pid,
    payment: updatedPayment,
    member: refreshed,
    before: beforeRow,
  };
}

async function readMembers(scope, branchScope = null, options = {}) {
  if (branchScope?.staffNoBranch) {
    return [];
  }
  const sb = getSupabase();
  const gid = gymId();
  const slim = options.view === 'list' || options.includeChildren === false;
  const columns = slim ? MEMBER_LIST_COLUMNS : '*';
  const updatedSince = toTs(options.updatedSince);
  const memberRows = await fetchAll((from, to) => {
    let q = applyActiveMembersFilter(
      sb.from(T.members).select(columns).eq('gym_id', gid),
    );
    // Phase 2 zero-leak: staff see only their branch; master owner in branch context also sees legacy untagged rows.
    if (branchScope?.gymCodeId) {
      if (branchScope.isOwner) {
        q = q.or(`assigned_gym_code_id.eq.${branchScope.gymCodeId},assigned_gym_code_id.is.null`);
      } else {
        q = q.eq('assigned_gym_code_id', branchScope.gymCodeId);
      }
    }
    if (updatedSince) q = q.gte('updated_at', updatedSince);
    return q.range(from, to);
  });
  if (slim) {
    const memberIds = memberRows.map((r) => r.id);
    const paymentsByMember = await loadMemberPaymentsForList(sb, gid, memberIds);
    return sandboxFilter(memberRows.map((row) => memberRowToApp(row, {
      payments: paymentsByMember.get(row.id) || [],
    }, { slim: true })), scope);
  }
  const memberIds = memberRows.map((r) => r.id);
  const children = await loadMemberChildren(sb, gid, memberIds);
  const members = memberRows.map((row) => memberRowToApp(row, {
    payments: children.paymentsByMember.get(row.id) || [],
    messages: children.messagesByMember.get(row.id) || [],
    attachments: children.attachmentsByMember.get(row.id) || [],
    injuryNotes: children.injuryByMember.get(row.id) || [],
  }));
  return sandboxFilter(members, scope);
}

/**
 * SQL-only staff payment-delete guard for bulk PUT.
 * Only compares members that include paymentHistory in the payload (slim bulk sync omits it).
 */
async function assertStaffPaymentDeletesAllowed(incomingMembers, branchScope = null) {
  const withPayments = (incomingMembers || []).filter((m) =>
    Object.prototype.hasOwnProperty.call(m || {}, 'paymentHistory'));
  if (!withPayments.length) return;

  const sb = getSupabase();
  const gid = gymId();
  const codes = [...new Set(withPayments.map((m) => String(m?.memberId || '').trim()).filter(Boolean))];
  if (!codes.length) return;

  const memberRows = await fetchAll((from, to) => {
    let q = sb.from(T.members).select('id, member_code').eq('gym_id', gid).in('member_code', codes);
    if (branchScope?.gymCodeId) q = q.eq('assigned_gym_code_id', branchScope.gymCodeId);
    return q.range(from, to);
  });
  const pkToCode = new Map((memberRows || []).map((r) => [r.id, String(r.member_code)]));
  const memberPks = [...pkToCode.keys()];
  if (!memberPks.length) return;

  const dbIdsByCode = new Map();
  for (const idChunk of chunk(memberPks, 100)) {
    const { data, error } = await sb
      .from(T.member_payment_history)
      .select('member_id, external_payment_id')
      .eq('gym_id', gid)
      .in('member_id', idChunk);
    if (error) throw new Error(`payment guard lookup: ${error.message}`);
    for (const row of data || []) {
      const code = pkToCode.get(row.member_id);
      if (!code) continue;
      const pid = String(row.external_payment_id || '').trim();
      if (!pid) continue;
      const set = dbIdsByCode.get(code) || new Set();
      set.add(pid);
      dbIdsByCode.set(code, set);
    }
  }

  const removed = [];
  for (const next of withPayments) {
    const code = String(next?.memberId || '').trim();
    if (!code) continue;
    const dbIds = dbIdsByCode.get(code);
    if (!dbIds?.size) continue;
    const nextHist = Array.isArray(next.paymentHistory) ? next.paymentHistory : [];
    const nextIds = new Set(nextHist.map((p) => String(p?.id || '').trim()).filter(Boolean));
    for (const pid of dbIds) {
      if (!nextIds.has(pid)) removed.push({ memberCode: code, paymentId: pid });
    }
  }
  if (removed.length) {
    const err = new Error('payment-delete-forbidden');
    err.status = 403;
    err.detail = { removed: removed.slice(0, 5) };
    throw err;
  }
}

/**
 * Surgical single-member update — used by PATCH /api/members/:memberId.
 *
 * Replaces the 4,000-RPC bulk-PUT fan-out (full members snapshot + per-member child sync)
 * with one targeted UPDATE. This is the durable path for gym-code reassignment.
 *
 * @param {string} memberCode  external "memberId" string (member_code column)
 * @param {object} patch       app-shaped partial fields; only the keys present are written
 * @param {object} [branchScope]  { gymCodeId, isOwner } — staff can only touch their branch
 * @returns {Promise<object|null>} App-shaped refreshed member, or null when row not visible
 */
async function updateMemberFields(memberCode, patch, branchScope = null) {
  const sb = getSupabase();
  const gid = gymId();
  const code = String(memberCode || '').trim();
  if (!code) {
    const err = new Error('member-code-required');
    err.status = 400;
    throw err;
  }
  if (!patch || typeof patch !== 'object') {
    const err = new Error('patch-required');
    err.status = 400;
    throw err;
  }

  const { memberPhotoStorageEnabled } = await import('../../services/memberPhoto/storageConstants.js');
  if (memberPhotoStorageEnabled() && Object.prototype.hasOwnProperty.call(patch, 'photo')) {
    const err = new Error('member-photo-use-upload-endpoint');
    err.status = 400;
    err.detail = { hint: 'POST /api/members/:memberId/photo' };
    throw err;
  }

  // We tolerate (data-anomaly) duplicate member_codes by picking the most recently
  // updated row. .maybeSingle() throws on >1 — that's correct for assertions but
  // unhelpful when the legacy snapshot has accidental dupes from old imports.
  const { data: dupRows, error: selErr } = await applyActiveMembersFilter(
    sb.from(T.members)
      .select('id, gym_id, member_code, form_no, assigned_gym_code_id, updated_at, deleted_at')
      .eq('gym_id', gid)
      .eq('member_code', code),
  )
    .order('updated_at', { ascending: false })
    .limit(1);
  if (selErr) throw new Error(`member lookup: ${selErr.message}`);
  const existingRow = Array.isArray(dupRows) && dupRows.length ? dupRows[0] : null;
  if (!existingRow || existingRow.deleted_at) {
    const err = new Error('member-not-found');
    err.status = 404;
    throw err;
  }

  if (branchScope?.staffNoBranch) {
    const err = new Error('member-not-found');
    err.status = 404;
    throw err;
  }

  if (branchScope?.gymCodeId && !branchScope.isOwner) {
    const existingCode = String(existingRow.assigned_gym_code_id || '');
    if (existingCode !== String(branchScope.gymCodeId)) {
      // Staff cannot read or mutate rows outside their branch. We surface 404 (not 403)
      // so an attacker cannot probe for member existence via timing/error differences.
      const err = new Error('member-not-found');
      err.status = 404;
      throw err;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'assignedGymCodeId')) {
      const want = String(patch.assignedGymCodeId || '').trim();
      if (want && !branchScopeAllowsMemberTransfer(branchScope, existingCode, want)) {
        const err = new Error('cross-branch-write-forbidden');
        err.status = 403;
        err.detail = { memberCode: code, requested: want, allowed: branchScope.gymCodeId };
        throw err;
      }
    }
  }

  const projection = appMemberToRow({
    memberId: code,
    ...patch,
    updatedAt: patch.updatedAt || new Date().toISOString(),
  }, gid);
  const dbPatch = {};
  for (const key of Object.keys(patch)) {
    const mapping = MEMBER_PATCH_KEY_MAP[key];
    if (!mapping) continue;
    dbPatch[mapping] = projection[mapping];
  }
  dbPatch.updated_at = projection.updated_at;
  if (projection.updated_by) dbPatch.updated_by = projection.updated_by;

  // Branch transfer conflict handling:
  // if target branch already has the same form_no, preserve numeric form_no and
  // make member_code unique using "-MOVED" suffix for traceability.
  const targetBranch = Object.prototype.hasOwnProperty.call(patch, 'assignedGymCodeId')
    ? String(patch.assignedGymCodeId || '').trim()
    : String(existingRow.assigned_gym_code_id || '').trim();
  const changingBranch = targetBranch && targetBranch !== String(existingRow.assigned_gym_code_id || '').trim();
  const currentFormNo = Number(existingRow.form_no || 0);
  if (changingBranch && Number.isFinite(currentFormNo) && currentFormNo > 0) {
    const { data: conflictRows, error: conflictErr } = await sb
      .from(T.members)
      .select('id')
      .eq('gym_id', gid)
      .eq('assigned_gym_code_id', targetBranch)
      .eq('form_no', currentFormNo)
      .neq('id', existingRow.id)
      .limit(1);
    if (conflictErr) throw new Error(`member transfer conflict check: ${conflictErr.message}`);
    if (Array.isArray(conflictRows) && conflictRows.length) {
      const baseCode = String(existingRow.member_code || code).trim();
      let nextCode = `${baseCode}-MOVED`;
      for (let i = 2; i < 100; i += 1) {
        const { data: hit, error: hitErr } = await sb
          .from(T.members)
          .select('id')
          .eq('gym_id', gid)
          .eq('member_code', nextCode)
          .limit(1);
        if (hitErr) throw new Error(`member transfer code check: ${hitErr.message}`);
        if (!Array.isArray(hit) || hit.length === 0) break;
        nextCode = `${baseCode}-MOVED${i}`;
      }
      dbPatch.member_code = nextCode;
    }
  }

  const { error: updErr } = await sb
    .from(T.members)
    .update(dbPatch)
    .eq('id', existingRow.id);
  if (updErr) throw new Error(`member update: ${updErr.message}`);

  const { data: refreshed, error: refErr } = await sb
    .from(T.members)
    .select('*')
    .eq('id', existingRow.id)
    .single();
  if (refErr) throw new Error(`member reload: ${refErr.message}`);

  if (Object.prototype.hasOwnProperty.call(patch, 'plan') && !isPtPlanName(refreshed?.plan_name)) {
    await safeDeleteByMemberIds(sb, T.pt_client_profiles, [existingRow.id]);
    notifyCollectionChange('settings');
  }

  let children = await loadMemberChildren(sb, gid, [refreshed.id]);
  const hasInjuryLogPatch = Object.prototype.hasOwnProperty.call(patch, 'medicalAnswers')
    && Array.isArray(patch.medicalAnswers?.injuryNotesLog);
  if (hasInjuryLogPatch) {
    const { injuryRows } = buildMemberChildRows(
      { memberId: code, medicalAnswers: patch.medicalAnswers },
      gid,
      refreshed.id,
    );
    await syncMemberChildRows(sb, T.member_injury_notes, {
      gymId: gid,
      memberId: refreshed.id,
      externalIdColumn: 'external_note_id',
      rows: injuryRows,
      onConflict: 'gym_id,member_id,external_note_id',
    });
    children = await loadMemberChildren(sb, gid, [refreshed.id]);
  }
  let appMember = memberRowToApp(refreshed, {
    payments: children.paymentsByMember.get(refreshed.id) || [],
    messages: children.messagesByMember.get(refreshed.id) || [],
    attachments: children.attachmentsByMember.get(refreshed.id) || [],
    injuryNotes: children.injuryByMember.get(refreshed.id) || [],
  });
  if (memberPhotoStorageEnabled()) {
    const { enrichMemberPhotoFromDbRow } = await import('../../services/memberPhoto/MemberPhotoService.js');
    appMember = await enrichMemberPhotoFromDbRow(appMember, refreshed);
  }
  const payMonthOnly = Object.prototype.hasOwnProperty.call(patch, 'payMonth')
    && !Object.prototype.hasOwnProperty.call(patch, 'paymentHistory');
  if (payMonthOnly) {
    try {
      await upsertMembershipPayMonthRow(sb, { gymId: gid, memberPk: refreshed.id, member: appMember });
    } catch (ledgerErr) {
      const msg = String(ledgerErr?.message || ledgerErr);
      if (!/member_paid_for_month|does not exist|42P01/i.test(msg)) throw ledgerErr;
    }
  } else if (
    Object.prototype.hasOwnProperty.call(patch, 'payMonth')
    || Object.prototype.hasOwnProperty.call(patch, 'paymentHistory')
  ) {
    try {
      await syncMemberPaidForMonthLedger(sb, { gymId: gid, memberPk: refreshed.id, member: appMember });
    } catch (ledgerErr) {
      const msg = String(ledgerErr?.message || ledgerErr);
      if (!/member_paid_for_month|does not exist|42P01/i.test(msg)) throw ledgerErr;
    }
  }
  notifyCollectionChange('members');

  return appMember;
}

/** Whitelist of app-fields → DB columns that PATCH is allowed to touch. */
const MEMBER_PATCH_KEY_MAP = {
  name: 'full_name',
  email: 'email',
  mobile: 'mobile',
  dob: 'dob',
  gender: 'gender',
  address: 'address',
  staff: 'assigned_staff',
  plan: 'plan_name',
  status: 'status',
  holdDuration: 'hold_duration',
  amount: 'amount',
  paymentMethod: 'payment_method',
  joiningDate: 'joining_date',
  billingDate: 'billing_date',
  billingDateUpdatedAt: 'billing_date_updated_at',
  nextPaymentDate: 'next_payment_date',
  paymentBy: 'payment_by',
  payMonth: 'pay_month',
  remark: 'remark',
  photo: 'photo_url',
  medicalSkipped: 'medical_skipped',
  medicalAnswers: 'medical_answers_json',
  ackAccepted: 'ack_accepted',
  ackSignature: 'ack_signature',
  ackDate: 'ack_date',
  parentGuardianName: 'parent_guardian_name',
  parentGuardianDob: 'parent_guardian_dob',
  parentGuardianSignature: 'parent_guardian_signature',
  familyGroupId: 'family_group_id',
  familyPrimaryMemberId: 'family_primary_member_id',
  lastSmsSent: 'last_sms_sent_json',
  assignedGymCodeId: 'assigned_gym_code_id',
};

async function safeDeleteByMemberIds(sb, table, memberIds) {
  if (!memberIds.length) return;
  for (const idChunk of chunk(memberIds, 100)) {
    const { error } = await sb.from(table).delete().in('member_id', idChunk);
    if (error && !isMissingDbTableError(error)) {
      throw new Error(`${table} delete: ${error.message}`);
    }
  }
}

async function deleteMemberChildren(sb, memberIds) {
  if (!memberIds.length) return;
  await safeDeleteByMemberIds(sb, T.member_payment_history, memberIds);
  await safeDeleteByMemberIds(sb, T.member_message_history, memberIds);
  await safeDeleteByMemberIds(sb, T.member_attachments, memberIds);
  await safeDeleteByMemberIds(sb, T.member_injury_notes, memberIds);
  await safeDeleteByMemberIds(sb, T.member_paid_for_month, memberIds);
  await safeDeleteByMemberIds(sb, T.pt_client_profiles, memberIds);
}

function paymentHistoryLogicalKey(p) {
  if (!p || typeof p !== 'object') return '';
  const paidRaw = String(p.paidAt || p.receivedAt || p.date || p.ts || '').trim();
  const day = paidRaw.length >= 10 ? paidRaw.slice(0, 10) : '';
  const month = String(p.billingMonth || (day.length >= 7 ? day.slice(0, 7) : '')).trim().toLowerCase();
  const amt = Number(p.amount || 0);
  const method = String(p.method || p.paymentMethod || '').trim().toLowerCase();
  const by = String(p.recordedBy || p.by || '').trim().toLowerCase();
  const source = String(p.source || '').trim().toLowerCase();
  const note = String(p.note || '').trim();
  if (!day && !amt && !method) return '';
  return `${day}|${month}|${amt}|${method}|${by}|${source}|${note}`;
}

function buildMemberChildRows(m, gid, memberPk) {
  const payRows = [];
  const msgRows = [];
  const attRows = [];
  const injuryRows = [];

  const payments = Array.isArray(m.paymentHistory) ? m.paymentHistory : [];
  const seenPaymentKeys = new Set();
  for (const p of payments) {
    const logicalKey = paymentHistoryLogicalKey(p);
    if (logicalKey) {
      if (seenPaymentKeys.has(logicalKey)) continue;
      seenPaymentKeys.add(logicalKey);
    }
    const resolvedPaidMonth = validatePaidMonthKey(p.paidMonth)
      || validatePaidMonthKey(p.billingMonth)
      || payMonthKeyFromStoredValue(m.payMonth)
      || resolvePaidMonthForPayment({
        paidMonth: p.paidMonth,
        paidAt: p.paidAt || p.receivedAt || p.date || p.ts,
      });
    payRows.push({
      gym_id: gid,
      member_id: memberPk,
      external_payment_id: p.id ? String(p.id) : crypto.randomUUID(),
      paid_at: toTs(p.paidAt || p.receivedAt || p.date || p.ts) || new Date().toISOString(),
      amount: Number(p.amount || 0),
      method: emptyText(p.method || p.paymentMethod),
      paid_month: emptyText(resolvedPaidMonth),
      billing_month: emptyText(p.billingMonth || resolvedPaidMonth),
      billing_date: paymentBillingDate(p),
      recorded_by: emptyText(p.recordedBy || p.by),
      source: emptyText(p.source),
      note: emptyText(p.note),
      created_at: toTs(p.createdAt) || new Date().toISOString(),
    });
  }

  const messages = Array.isArray(m.messageHistory) ? m.messageHistory : [];
  for (const ev of messages) {
    msgRows.push({
      gym_id: gid,
      member_id: memberPk,
      external_event_id: ev.id ? String(ev.id) : crypto.randomUUID(),
      channel: emptyText(ev.channel),
      template_key: emptyText(ev.templateKey),
      status: emptyText(ev.status),
      sent_at: toTs(ev.sentAt || ev.ts) || new Date().toISOString(),
      sent_by: emptyText(ev.sentBy || ev.by || ev.calledBy),
      payload_json: ev,
      created_at: toTs(ev.sentAt || ev.ts) || new Date().toISOString(),
    });
  }

  const attachments = Array.isArray(m.attachments) ? m.attachments : [];
  for (const a of attachments) {
    attRows.push({
      gym_id: gid,
      member_id: memberPk,
      file_name: emptyText(a.name) || 'file',
      mime_type: emptyText(a.mime),
      file_size: Number(a.size || 0) || null,
      storage_path: a.dataUrl ? String(a.dataUrl).slice(0, 500000) : null,
      uploaded_at: toTs(a.uploadedAt) || new Date().toISOString(),
    });
  }

  const injuryLog = m.medicalAnswers?.injuryNotesLog;
  if (Array.isArray(injuryLog)) {
    for (const n of injuryLog) {
      injuryRows.push({
        gym_id: gid,
        member_id: memberPk,
        external_note_id: n.id ? String(n.id) : null,
        note_text: emptyText(n.text || n.note) || '-',
        created_by: emptyText(n.by || n.createdBy),
        created_at: toTs(n.at || n.createdAt || n.ts) || new Date().toISOString(),
      });
    }
  }

  return { payRows, msgRows, attRows, injuryRows };
}

async function writeMembers(members, scope, options = {}) {
  const sb = getSupabase();
  const gid = gymId();
  const blockedSet = await loadBlockedMemberCodes(sb, gid, options.blockedMemberCodes || []);
  const { allowed: writable, skipped } = filterMembersBlockedFromBulkWrite(
    sandboxFilter(Array.isArray(members) ? members : [], scope),
    blockedSet,
  );
  if (skipped.length) {
    // eslint-disable-next-line no-console
    console.warn(`[writeMembers] skipped ${skipped.length} blocked deleted member_code(s)`);
  }
  const incoming = writable;

  const existing = await fetchAll((from, to) => sb
    .from(T.members)
    .select('id, member_code, photo_url, billing_date, billing_date_updated_at, next_payment_date, payment_by')
    .eq('gym_id', gid)
    .range(from, to));
  const existingByCode = new Map((existing || []).map((r) => [String(r.member_code), r]));
  const photoByCode = new Map((existing || []).map((r) => [String(r.member_code), r.photo_url]));

  // Upsert-only: never delete members missing from a partial browser upload (prevents mass data loss).

  const { preserveNewerBillingOnBulkRow } = await import('./memberBillingBulkGuard.js');
  const memberRows = incoming
    .filter((m) => m?.memberId)
    .map((m) => {
      let row = appMemberToRow(m, gid, { partialBulkSync: true });
      const prev = existingByCode.get(String(row.member_code));
      if (prev) row = preserveNewerBillingOnBulkRow(row, prev);
      if (!String(row.photo_url || '').trim()) {
        const prevPhoto = photoByCode.get(String(row.member_code));
        if (String(prevPhoto || '').trim()) row.photo_url = prevPhoto;
      }
      return row;
    });

  let codeToId = new Map((existing || []).map((r) => [String(r.member_code), r.id]));
  const useBulkUpsert = await membersBulkUpsertReady();
  if (useBulkUpsert) {
    await bulkUpsertMemberRows(memberRows);
  } else {
    const toInsert = [];
    const toUpdate = [];
    for (const row of memberRows) {
      const pk = codeToId.get(String(row.member_code));
      if (pk) toUpdate.push({ pk, row });
      else toInsert.push(row);
    }

    for (const part of chunk(toInsert, 80)) {
      const { data, error } = await sb.from(T.members).insert(part).select('id, member_code');
      if (error) throw new Error(`members insert: ${error.message}`);
      for (const r of data || []) codeToId.set(String(r.member_code), r.id);
    }

    for (const part of chunk(toUpdate, 25)) {
      await Promise.all(
        part.map(async ({ pk, row }) => {
          const { error } = await sb.from(T.members).update(row).eq('id', pk);
          if (error) throw new Error(`members update ${row.member_code}: ${error.message}`);
        }),
      );
    }
  }

  const refreshed = await fetchAll((from, to) => sb.from(T.members).select('id, member_code').eq('gym_id', gid).range(from, to));
  codeToId = new Map((refreshed || []).map((r) => [String(r.member_code), r.id]));

  // Batch PT profile cleanup for non-PT members (was one DELETE per member → 504 on large branches).
  const nonPtMemberPks = [];
  for (const m of incoming) {
    if (!m?.memberId || isPtPlanName(m.plan)) continue;
    const memberPk = codeToId.get(String(m.memberId));
    if (memberPk) nonPtMemberPks.push(memberPk);
  }
  await safeDeleteByMemberIds(sb, T.pt_client_profiles, nonPtMemberPks);

  for (const m of incoming) {
    const memberPk = codeToId.get(String(m.memberId));
    if (!memberPk) continue;
    const { payRows, msgRows, attRows, injuryRows } = buildMemberChildRows(m, gid, memberPk);
    if (Object.prototype.hasOwnProperty.call(m, 'paymentHistory')) {
      await syncMemberChildRows(sb, T.member_payment_history, {
        gymId: gid,
        memberId: memberPk,
        externalIdColumn: 'external_payment_id',
        rows: payRows,
        onConflict: 'gym_id,member_id,external_payment_id',
      });
      try {
        await syncMemberPaidForMonthLedger(sb, { gymId: gid, memberPk, member: m });
      } catch (ledgerErr) {
        const msg = String(ledgerErr?.message || ledgerErr);
        if (!/member_paid_for_month|does not exist|42P01/i.test(msg)) throw ledgerErr;
      }
    }
    // payMonth ledger sync runs on PATCH only — not on debounced bulk PUT (avoids N× delete/upsert timeouts).
    if (Object.prototype.hasOwnProperty.call(m, 'messageHistory')) {
      await syncMemberChildRows(sb, T.member_message_history, {
        gymId: gid,
        memberId: memberPk,
        externalIdColumn: 'external_event_id',
        rows: msgRows,
        onConflict: 'gym_id,member_id,external_event_id',
      });
    }
    if (Object.prototype.hasOwnProperty.call(m, 'attachments')) {
      await syncMemberChildRows(sb, T.member_attachments, {
        gymId: gid,
        memberId: memberPk,
        externalIdColumn: null,
        rows: attRows,
      });
    }
    const hasInjuryLog = Object.prototype.hasOwnProperty.call(m, 'medicalAnswers')
      && Array.isArray(m.medicalAnswers?.injuryNotesLog);
    if (hasInjuryLog) {
      await syncMemberChildRows(sb, T.member_injury_notes, {
        gymId: gid,
        memberId: memberPk,
        externalIdColumn: 'external_note_id',
        rows: injuryRows,
        onConflict: 'gym_id,member_id,external_note_id',
      });
    }
  }

  notifyCollectionChange('members');
}

async function readUsers(scope) {
  const sb = getSupabase();
  const gid = gymId();
  let query = sb.from(T.staff_users).select('*').eq('gym_id', gid);
  if (scope) query = query.eq('sandbox_id', scope.sandboxId);
  const staffRows = await fetchAll((from, to) => query.range(from, to));
  if (!staffRows.length) return [];

  const staffIds = staffRows.map((r) => r.id);
  const [secRes, accRes] = await Promise.all([
    sb.from(T.staff_user_sections).select('staff_user_id, section_name').in('staff_user_id', staffIds),
    sb.from(T.staff_user_access).select('staff_user_id, access_json').in('staff_user_id', staffIds),
  ]);
  if (secRes.error) throw secRes.error;
  if (accRes.error) throw accRes.error;

  const sectionsByStaff = new Map();
  for (const row of secRes.data || []) {
    const list = sectionsByStaff.get(row.staff_user_id) || [];
    list.push(row.section_name);
    sectionsByStaff.set(row.staff_user_id, list);
  }
  const accessByStaff = new Map();
  for (const row of (accRes.data || []).sort((a, b) => Number(b.id) - Number(a.id))) {
    if (!accessByStaff.has(row.staff_user_id)) {
      accessByStaff.set(row.staff_user_id, row.access_json || {});
    }
  }

  const branchesByStaff = new Map();
  try {
    const assignRes = await sb
      .from(T.staff_branch_assignments)
      .select('staff_user_id, gym_code_id, is_primary')
      .eq('gym_id', gid)
      .in('staff_user_id', staffIds);
    if (!assignRes.error) {
      const rows = [...(assignRes.data || [])].sort((a, b) => {
        if (a.is_primary === b.is_primary) return 0;
        return a.is_primary ? -1 : 1;
      });
      for (const row of rows) {
        const pk = row.staff_user_id;
        const id = String(row.gym_code_id || '').trim();
        if (!id) continue;
        const list = branchesByStaff.get(pk) || [];
        if (!list.includes(id)) list.push(id);
        branchesByStaff.set(pk, list);
      }
    }
  } catch {
    /* assignments table optional until migration */
  }

  const apps = staffRows.map((row) => {
    const fromAssignments = branchesByStaff.get(row.id);
    const assigned = fromAssignments?.length
      ? [...new Set(fromAssignments.filter(Boolean))]
      : (row.gym_code_id ? [String(row.gym_code_id)] : []);
    return staffRowToApp(
      row,
      [...new Set(sectionsByStaff.get(row.id) || [])],
      accessByStaff.get(row.id) || {},
      assigned,
    );
  });
  if (memberPhotoStorageEnabled()) {
    return enrichStaffUsersWithPhotoUrls(apps, staffRows);
  }
  return apps;
}

async function resolveDefaultStaffGymCodeId(sb, gid) {
  try {
    const { data, error } = await sb.from(T.gym_codes).select('id').eq('gym_id', gid).order('code').limit(1);
    if (error) return null;
    return data?.[0]?.id ? String(data[0].id) : null;
  } catch {
    return null;
  }
}

async function writeUsers(users, scope) {
  const sb = getSupabase();
  const gid = gymId();
  const incoming = sandboxFilter(Array.isArray(users) ? users : [], scope);
  const defaultGymCodeId = await resolveDefaultStaffGymCodeId(sb, gid);
  const loginIds = new Set(incoming.map((u) => String(u.id || '').trim()).filter(Boolean));

  let existingQuery = sb.from(T.staff_users).select('id, staff_login_id, password_hash, photo_url, photo_path, photo_version').eq('gym_id', gid);
  if (scope) existingQuery = existingQuery.eq('sandbox_id', scope.sandboxId);
  const existing = await fetchAll((from, to) => existingQuery.range(from, to));

  const branchesByStaffPk = new Map();
  try {
    const staffPks = (existing || []).map((r) => r.id).filter(Boolean);
    if (staffPks.length) {
      const assignRes = await sb
        .from(T.staff_branch_assignments)
        .select('staff_user_id, gym_code_id, is_primary')
        .eq('gym_id', gid)
        .in('staff_user_id', staffPks);
      if (!assignRes.error) {
        const rows = [...(assignRes.data || [])].sort((a, b) => {
          if (a.is_primary === b.is_primary) return 0;
          return a.is_primary ? -1 : 1;
        });
        for (const row of rows) {
          const pk = row.staff_user_id;
          const id = String(row.gym_code_id || '').trim();
          if (!id) continue;
          const list = branchesByStaffPk.get(pk) || [];
          if (!list.includes(id)) list.push(id);
          branchesByStaffPk.set(pk, list);
        }
      }
    }
  } catch {
    /* assignments optional until migration */
  }

  // Upsert-only: do not delete staff missing from a partial browser list (prevents losing accounts like Deep).

  for (const u of incoming) {
    if (!u?.id) continue;
    const row = appStaffToRow(u, gid);
    if (scope) row.sandbox_id = scope.sandboxId;
    if (!row.gym_code_id && defaultGymCodeId) row.gym_code_id = defaultGymCodeId;
    const loginLower = String(u.id || '').trim().toLowerCase();
    if (loginLower === 'owner') {
      row.staff_role = 'master_owner';
    } else if (u.staffRole) {
      row.staff_role = String(u.staffRole).trim();
    } else if (!row.staff_role) {
      row.staff_role = 'staff';
    }

    const found = (existing || []).find((r) => String(r.staff_login_id) === String(u.id));
    if (found && memberPhotoStorageEnabled()) {
      if (String(found.photo_path || '').trim()) row.photo_path = found.photo_path;
      if (found.photo_version != null) row.photo_version = found.photo_version;
      row.photo_url = null;
    } else if (found && !String(row.photo_url || '').trim() && String(found.photo_url || '').trim()) {
      row.photo_url = found.photo_url;
    }
    let staffPk;
    if (found) {
      try {
        await updateStaffUserRow(sb, found.id, row);
      } catch (error) {
        throw new Error(`staff update ${u.id}: ${error.message}`);
      }
      staffPk = found.id;
    } else {
      const placeholderHash = await hashPassword(`apg-temp-${crypto.randomUUID()}`);
      const { data, error } = await sb
        .from(T.staff_users)
        .insert({ ...row, password_hash: placeholderHash })
        .select('id')
        .single();
      if (error) throw new Error(`staff insert ${u.id}: ${error.message}`);
      staffPk = data.id;
    }

    const isOwnerLogin = String(u.id || '').trim().toLowerCase() === 'owner';
    const sections = isOwnerLogin ? [...ALL_SECTIONS] : (Array.isArray(u.sections) ? u.sections : []);
    await syncStaffUserSections(sb, staffPk, sections);
    await syncStaffUserAccess(sb, staffPk, u.access);
    const branchIds = Array.isArray(u.assignedBranchIds) && u.assignedBranchIds.length
      ? [...new Set(u.assignedBranchIds.map((id) => String(id || '').trim()).filter(Boolean))]
      : (row.gym_code_id ? [String(row.gym_code_id)] : []);
    try {
      const { syncStaffBranchAssignments, shouldSyncBranchAssignmentsOnWrite } = await import('../../auth/tenant/branchAssignments.js');
      const existingBranchIds = branchesByStaffPk.get(staffPk) || [];
      if (shouldSyncBranchAssignmentsOnWrite(u, branchIds, existingBranchIds)) {
        await syncStaffBranchAssignments(
          staffPk,
          branchIds,
          row.gym_code_id || branchIds[0],
          u.updatedBy || null,
        );
        branchesByStaffPk.set(staffPk, branchIds);
      }
    } catch (assignErr) {
      console.error('[users] staff_branch_assignments sync failed:', assignErr?.message || assignErr);
      throw assignErr;
    }
    invalidateStaffAccessCache(u.id);
  }
  notifyCollectionChange('users');
}

async function cleanupDuplicateRoleTemplateRows(sb, gid) {
  const rows = await fetchAll((from, to) =>
    sb.from(T.staff_role_templates).select('id, title, sections_json, sort_order, external_template_id').eq('gym_id', gid).order('sort_order').range(from, to),
  );
  if (!rows || rows.length < 2) return;
  const byTitle = new Map();
  const deleteIds = [];
  for (const row of rows) {
    const tk = roleTemplateTitleKey(row);
    if (!tk) continue;
    const prev = byTitle.get(tk);
    if (!prev) {
      byTitle.set(tk, row);
      continue;
    }
    const prevSecs = Array.isArray(prev.sections_json) ? prev.sections_json.length : 0;
    const rowSecs = Array.isArray(row.sections_json) ? row.sections_json.length : 0;
    const keep = rowSecs >= prevSecs ? row : prev;
    const drop = keep.id === row.id ? prev : row;
    byTitle.set(tk, keep);
    deleteIds.push(drop.id);
  }
  for (const part of chunk(deleteIds, 80)) {
    if (!part.length) continue;
    const { error } = await sb.from(T.staff_role_templates).delete().in('id', part);
    if (error) throw new Error(`staff_role_templates dedupe cleanup: ${error.message}`);
  }
}

async function syncRoleTemplatesToDb(sb, gid, roleTemplates) {
  const roles = dedupeRoleTemplates(Array.isArray(roleTemplates) ? roleTemplates : []);
  const roleRows = roles.map((role, idx) => roleTemplateToRow(gid, role, idx));
  try {
    await syncGymRowsByExternalId(sb, T.staff_role_templates, {
      gymId: gid,
      externalIdColumn: 'external_template_id',
      rows: roleRows,
      onConflict: 'gym_id,external_template_id',
    });
  } catch (err) {
    const msg = String(err?.message || err);
    if (!msg.includes('external_template_id')) throw err;
    await sb.from(T.staff_role_templates).delete().eq('gym_id', gid);
    for (const part of chunk(roleRows, 80)) {
      if (!part.length) continue;
      const legacy = part.map(({ external_template_id, ...row }) => row);
      const { error } = await sb.from(T.staff_role_templates).insert(legacy);
      if (error) throw new Error(`staff_role_templates legacy insert: ${error.message}`);
    }
  }
  return roles;
}

async function fetchAppConfigRow(sb, gid) {
  const { data, error } = await sb
    .from(T.settings_app_config)
    .select('*')
    .eq('gym_id', gid)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`settings_app_config: ${error.message}`);
  return data?.[0] ?? null;
}

let settingsLookupBranchColumnKnown = null;
async function settingsLookupHasBranchColumn(sb) {
  if (settingsLookupBranchColumnKnown != null) return settingsLookupBranchColumnKnown;
  const { data, error } = await sb
    .from('information_schema.columns')
    .select('column_name')
    .eq('table_schema', 'public')
    .eq('table_name', T.settings_lookup_values)
    .eq('column_name', 'created_by_gym_code_id')
    .limit(1);
  if (error) {
    settingsLookupBranchColumnKnown = false;
    return false;
  }
  settingsLookupBranchColumnKnown = Boolean((data || []).length);
  return settingsLookupBranchColumnKnown;
}

function authIsMasterOwnerLike(auth) {
  const role = String(auth?.staffRole || auth?.staff_role || auth?.role || '').trim().toLowerCase();
  const id = String(auth?.userId || '').trim().toLowerCase();
  return id === 'owner' || role === 'owner' || role === 'master_owner';
}

function authAllowedBranchIds(auth) {
  const one = String(auth?.gymCodeId || auth?.gym_code_id || '').trim();
  const assigned = Array.isArray(auth?.assignedBranchIds) ? auth.assignedBranchIds : [];
  const assigned2 = Array.isArray(auth?.assigned_branch_ids) ? auth.assigned_branch_ids : [];
  return [...new Set([one, ...assigned, ...assigned2].map((x) => String(x || '').trim()).filter(Boolean))];
}

async function finalizeSettingsForAuth(settings, options, settingsScope) {
  const auth = options?.auth || null;
  if (!auth) return settings;
  const sb = getSupabase();
  const gid = gymId();
  return applySettingsBranchFilter(
    settings,
    auth,
    options?.staffAccess || null,
    settingsScope,
    { sb, gid, fetchAll, chunk },
  );
}

async function readSettings(scope, options = {}) {
  if (scope) {
    return readSettingsSandbox(scope.sandboxId);
  }
  const sb = getSupabase();
  const gid = gymId();
  const { scope: settingsScope, wantCore, wantLeave, wantPt } = settingsScopeFlags(options.scope);

  if (settingsScope === 'leave') {
    const leaveRows = await fetchAll((from, to) =>
      sb.from(T.leave_requests).select('*').eq('gym_id', gid).range(from, to));
    return finalizeSettingsForAuth({ leaveRequests: mapLeaveRows(leaveRows) }, options, 'leave');
  }

  if (settingsScope === 'pt') {
    const ptRows = await fetchAll((from, to) =>
      sb.from(T.pt_client_profiles).select('*').eq('gym_id', gid).range(from, to));
    return finalizeSettingsForAuth(
      { ptClientProfiles: await buildPtProfilesFromRows(sb, gid, ptRows) },
      options,
      'pt',
    );
  }

  const fetches = [];
  if (wantCore) {
    fetches.push(
      fetchAll((from, to) => sb.from(T.settings_lookup_values).select('*').eq('gym_id', gid).order('sort_order').range(from, to)),
      fetchAll((from, to) => sb.from(T.settings_templates).select('*').eq('gym_id', gid).range(from, to)),
      fetchAppConfigRow(sb, gid),
      fetchAll((from, to) => sb.from(T.settings_staff_directory).select('*').eq('gym_id', gid).range(from, to)),
      fetchAll((from, to) => sb.from(T.staff_role_templates).select('*').eq('gym_id', gid).order('sort_order').range(from, to)),
    );
  }
  if (wantLeave && settingsScope === 'full') {
    fetches.push(fetchAll((from, to) => sb.from(T.leave_requests).select('*').eq('gym_id', gid).range(from, to)));
  }
  if (wantPt && settingsScope === 'full') {
    fetches.push(fetchAll((from, to) => sb.from(T.pt_client_profiles).select('*').eq('gym_id', gid).range(from, to)));
  }

  const results = await Promise.all(fetches);
  let idx = 0;
  const lookupsRaw = wantCore ? results[idx++] : [];
  const templates = wantCore ? results[idx++] : [];
  const configRow = wantCore ? results[idx++] : null;
  const staffDir = wantCore ? results[idx++] : [];
  const roles = wantCore ? results[idx++] : [];
  const leaveRows = wantLeave && settingsScope === 'full' ? results[idx++] : [];
  const ptRows = wantPt && settingsScope === 'full' ? results[idx++] : [];

  let lookups = Array.isArray(lookupsRaw) ? lookupsRaw : [];
  const auth = options?.auth || null;
  if (auth && !authIsMasterOwnerLike(auth)) {
    const allowed = new Set(authAllowedBranchIds(auth));
    lookups = lookups.filter((row) => {
      const createdRole = String(row?.created_by_role || '').trim().toLowerCase();
      if (createdRole !== 'branch_owner') return true; // keep global/master values visible
      const rowBranch = String(row?.created_by_gym_code_id || '').trim();
      if (!rowBranch) return false;
      return allowed.has(rowBranch);
    });
  }

  const settings = buildSettingsObject({
    lookups,
    templates,
    configRow,
    staffDir,
    roles,
    leaveRows,
    attendanceRows: [],
  });

  if (wantPt && settingsScope === 'full') {
    settings.ptClientProfiles = await buildPtProfilesFromRows(sb, gid, ptRows);
  }

  return finalizeSettingsForAuth(settings, options, settingsScope);
}

function mapLeaveRows(leaveRows) {
  return (leaveRows || []).map((r) => {
    const startDate = r.start_date;
    const endDate = r.end_date;
    return {
      id: r.external_request_id,
      userId: r.staff_login_id,
      type: r.leave_type,
      startDate,
      endDate,
      days: leaveDaysFromDateRange(startDate, endDate),
      reason: r.reason,
      status: r.status,
      approvedBy: r.approved_by,
      createdAt: r.created_at,
    };
  });
}

async function buildPtProfilesFromRows(sb, gid, ptRowsPrefetched) {
  const ptRows = ptRowsPrefetched ?? await fetchAll((from, to) =>
    sb.from(T.pt_client_profiles).select('*').eq('gym_id', gid).range(from, to));
  const profiles = {};
  const memberPks = [...new Set((ptRows || []).map((p) => p.member_id).filter(Boolean))];
  const idToCode = new Map();
  const planById = new Map();
  for (const idChunk of chunk(memberPks, 100)) {
    const { data, error } = await sb.from(T.members).select('id, member_code, plan_name').eq('gym_id', gid).in('id', idChunk);
    if (error) throw error;
    for (const row of data || []) {
      idToCode.set(row.id, row.member_code);
      planById.set(row.id, row.plan_name);
    }
  }
  const orphanMemberPks = [];
  for (const p of ptRows || []) {
    const code = idToCode.get(p.member_id);
    const planName = planById.get(p.member_id);
    if (!code) continue;
    if (!isPtPlanName(planName)) {
      orphanMemberPks.push(p.member_id);
      continue;
    }
    profiles[code] = p.plan_json && typeof p.plan_json === 'object' ? p.plan_json : {};
  }
  if (orphanMemberPks.length) {
    await safeDeleteByMemberIds(sb, T.pt_client_profiles, orphanMemberPks);
    notifyCollectionChange('settings');
  }
  return profiles;
}

function buildSettingsObject({ lookups, templates, configRow, staffDir, roles, leaveRows, attendanceRows }) {
  const settings = {
    plans: [],
    statuses: [],
    paymentMethods: [],
    holdDurations: [],
    genders: [],
    expenseCategories: [],
    exerciseTypes: [],
    staff: [],
    roleTemplates: [],
    smsTemplates: {},
    leaveRequests: [],
    staffAttendance: [],
    ptClientProfiles: {},
    fineSmsEnabled: true,
    fineSmsGraceDays: 0,
    fineSmsImmediateRoles: [],
    financeUseEstimatedExpense: true,
  };

  for (const [key, category] of LOOKUP_CATEGORIES) {
    const values = (lookups || [])
      .filter((r) => r.category === category && r.is_active !== false)
      .map((r) => String(r.value || '').trim())
      .filter(Boolean);
    settings[key] = [...new Set(values)];
  }

  // WhatsApp bodies are branch-scoped — loaded via GET /api/whatsapp-templates?gymCodeId=
  // (settings.smsTemplates left empty to avoid cross-branch leakage on hydrate).

  applySettingsConfigJson(settings, configRow);
  for (const [key] of LOOKUP_CATEGORIES) {
    if (Array.isArray(settings[key])) {
      settings[key] = [...new Set(settings[key].map((v) => String(v || '').trim()).filter(Boolean))];
    }
  }

  settings.staff = (staffDir || []).map((s) => ({
    id: s.staff_code,
    name: s.display_name,
    email: s.email,
    avatar: s.avatar_url,
  }));

  settings.roleTemplates = dedupeRoleTemplates((roles || []).map((r) => roleTemplateRowToApp(r)));

  settings.leaveRequests = mapLeaveRows(leaveRows);

  settings.staffAttendance = (attendanceRows || []).map((r) => ({
    id: r.external_record_id,
    userId: r.staff_login_id,
    date: r.attendance_date,
    status: r.status,
    checkIn: r.check_in,
    checkOut: r.check_out,
    note: r.note,
    firstLoginAt: r.first_login_at,
    lastLogoutAt: r.last_logout_at,
    autoPresentWindowUntil: r.auto_present_window_until,
    timeZoneAtMark: r.timezone_at_mark,
    autoMarked: r.auto_marked,
    markedBy: r.marked_by,
    leaveRequestId: r.leave_request_id,
    leaveAutoSynced: r.leave_auto_synced,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
  }));

  settings.ptClientProfiles = {};
  return settings;
}

async function enrichPtProfiles(settings) {
  const sb = getSupabase();
  const gid = gymId();
  settings.ptClientProfiles = await buildPtProfilesFromRows(sb, gid, null);
}

async function readSettingsSandbox(sandboxId) {
  return {};
}

function resolveLookupCategory(categoryOrKey) {
  const raw = String(categoryOrKey || '').trim();
  if (!raw) return null;
  const row = LOOKUP_CATEGORIES.find(([k, c]) => k === raw || c === raw);
  return row ? { key: row[0], category: row[1] } : null;
}

/** Diff-based lookup sync — inserts missing values and deletes removed ones only. */
async function syncLookupValues(sb, gid, settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  const existing = await fetchAll((from, to) =>
    sb.from(T.settings_lookup_values).select('id, category, value, sort_order, is_active').eq('gym_id', gid).range(from, to),
  );
  const active = (existing || []).filter((r) => r.is_active !== false);
  const toDeleteIds = [];
  const toInsert = [];

  for (const [key, category] of LOOKUP_CATEGORIES) {
    const wantList = (Array.isArray(s[key]) ? s[key] : [])
      .map((v) => String(v || '').trim())
      .filter(Boolean);
    const wantSet = new Set(wantList);
    const have = active.filter((r) => r.category === category);
    if (shouldSkipLookupCategorySync(wantList, have)) {
      continue;
    }
    const haveByValue = new Map(have.map((r) => [String(r.value || '').trim(), r]));
    for (const row of have) {
      const val = String(row.value || '').trim();
      if (!wantSet.has(val)) toDeleteIds.push(row.id);
    }
    let sortBase = have.reduce((max, r) => Math.max(max, Number(r.sort_order || 0)), -1) + 1;
    wantList.forEach((value, idx) => {
      if (!haveByValue.has(value)) {
        toInsert.push({
          gym_id: gid,
          category,
          value,
          sort_order: sortBase + idx,
          is_active: true,
        });
      }
    });
  }

  for (const part of chunk(toDeleteIds, 80)) {
    if (part.length) await sb.from(T.settings_lookup_values).delete().in('id', part);
  }
  for (const part of chunk(toInsert, 80)) {
    if (part.length) await sb.from(T.settings_lookup_values).insert(part);
  }
}

/**
 * Surgical single-value insert for settings lookup lists (plans, statuses, etc.).
 * Owner-gated at the route layer.
 */
export async function addSettingsLookupValue(_scope, {
  category,
  value,
  createdByRole = null,
  createdByStaffLoginId = null,
  createdByGymCodeId = null,
}) {
  const resolved = resolveLookupCategory(category);
  if (!resolved) throw new Error('invalid_lookup_category');
  const val = String(value || '').trim();
  if (!val || val.length > 120) throw new Error('invalid_lookup_value');

  const sb = getSupabase();
  const gid = gymId();
  const { data: dup } = await sb
    .from(T.settings_lookup_values)
    .select('id')
    .eq('gym_id', gid)
    .eq('category', resolved.category)
    .eq('value', val)
    .eq('is_active', true)
    .maybeSingle();
  if (dup?.id) {
    return { ok: true, category: resolved.key, value: val, duplicate: true };
  }

  const rows = await fetchAll((from, to) =>
    sb
      .from(T.settings_lookup_values)
      .select('sort_order')
      .eq('gym_id', gid)
      .eq('category', resolved.category)
      .order('sort_order', { ascending: false })
      .limit(1)
      .range(from, to),
  );
  const nextSort = rows.length ? Number(rows[0].sort_order || 0) + 1 : 0;
  const insertRow = {
    gym_id: gid,
    category: resolved.category,
    value: val,
    sort_order: nextSort,
    is_active: true,
  };
  if (createdByRole) insertRow.created_by_role = String(createdByRole);
  if (createdByStaffLoginId) insertRow.created_by_staff_login_id = String(createdByStaffLoginId);
  if (createdByGymCodeId && await settingsLookupHasBranchColumn(sb)) {
    insertRow.created_by_gym_code_id = String(createdByGymCodeId);
  }
  let { error } = await sb.from(T.settings_lookup_values).insert(insertRow);
  if (error && /created_by_gym_code_id/i.test(String(error.message || ''))) {
    const fallback = { ...insertRow };
    delete fallback.created_by_gym_code_id;
    ({ error } = await sb.from(T.settings_lookup_values).insert(fallback));
  }
  if (error) throw error;
  notifyCollectionChange('settings');
  return { ok: true, category: resolved.key, value: val };
}

/**
 * Surgical single-value delete for settings lookup lists.
 */
export async function deleteSettingsLookupValue(_scope, {
  category,
  value,
  requesterRole = null,
  requesterStaffLoginId = null,
  requesterGymCodeId = null,
}) {
  const resolved = resolveLookupCategory(category);
  if (!resolved) throw new Error('invalid_lookup_category');
  const val = String(value || '').trim();
  if (!val) throw new Error('invalid_lookup_value');

  const sb = getSupabase();
  const gid = gymId();
  const lookupHasBranchCol = await settingsLookupHasBranchColumn(sb);
  let existing = null;
  let findErr = null;
  if (lookupHasBranchCol) {
    ({ data: existing, error: findErr } = await sb
      .from(T.settings_lookup_values)
      .select('id, created_by_role, created_by_staff_login_id, created_by_gym_code_id')
      .eq('gym_id', gid)
      .eq('category', resolved.category)
      .eq('value', val)
      .maybeSingle());
  } else {
    ({ data: existing, error: findErr } = await sb
      .from(T.settings_lookup_values)
      .select('id, created_by_role, created_by_staff_login_id')
      .eq('gym_id', gid)
      .eq('category', resolved.category)
      .eq('value', val)
      .maybeSingle());
  }
  if (findErr) throw findErr;
  if (!existing?.id) {
    return { ok: true, category: resolved.key, value: val, deleted: 0 };
  }
  const createdRole = String(existing.created_by_role || '').trim().toLowerCase();
  const requesterRoleNorm = String(requesterRole || '').trim().toLowerCase();
  const isMasterRequester = requesterRoleNorm === 'master_owner';
  if (!isMasterRequester) {
    // Legacy/null + explicit owner-created rows are read-only for non-owner staff.
    if (!createdRole || createdRole === 'master_owner' || createdRole === 'owner') {
      const err = new Error('lookup-delete-owner-protected');
      err.status = 403;
      throw err;
    }
    const creator = String(existing.created_by_staff_login_id || '').trim().toLowerCase();
    const requester = String(requesterStaffLoginId || '').trim().toLowerCase();
    if (!creator || !requester || creator !== requester) {
      const err = new Error('lookup-delete-not-owned');
      err.status = 403;
      throw err;
    }
    if (lookupHasBranchCol) {
      const rowBranch = String(existing.created_by_gym_code_id || '').trim();
      const reqBranch = String(requesterGymCodeId || '').trim();
      if (!rowBranch || !reqBranch || rowBranch !== reqBranch) {
        const err = new Error('lookup-delete-not-owned');
        err.status = 403;
        throw err;
      }
    }
  }
  const { data, error } = await sb
    .from(T.settings_lookup_values)
    .delete()
    .eq('id', existing.id)
    .select('id');
  if (error) throw error;
  notifyCollectionChange('settings');
  return { ok: true, category: resolved.key, value: val, deleted: (data || []).length };
}

async function writeSettings(settings, scope) {
  if (scope) return;
  const sb = getSupabase();
  const gid = gymId();
  const existing = await readSettings(scope);
  const incoming = settings && typeof settings === 'object' ? settings : {};
  const hasRoleTemplates = Object.prototype.hasOwnProperty.call(incoming, 'roleTemplates');
  let s = { ...incoming };
  s = preserveNonEmptyLookups(s, existing);
  s = mergeSettingsPreservingRoleTemplates(
    hasRoleTemplates ? s : { ...s, roleTemplates: undefined },
    existing,
  );

  await syncLookupValues(sb, gid, s);

  // Branch-scoped WhatsApp templates are not rewritten via settings bulk (PATCH per branch/key).

  await sb.from(T.settings_staff_directory).delete().eq('gym_id', gid);
  const staffDir = Array.isArray(s.staff) ? s.staff : [];
  if (staffDir.length) {
    await sb.from(T.settings_staff_directory).insert(
      staffDir.map((row) => ({
        gym_id: gid,
        staff_code: String(row.id || row.name || '').trim(),
        display_name: String(row.name || row.id || '').trim(),
        email: row.email || null,
        avatar_url: row.avatar || null,
      })),
    );
  }

  if (hasRoleTemplates) {
    await syncRoleTemplatesToDb(sb, gid, s.roleTemplates);
  }

  const configJson = {
    medicalQuestionnaireTemplate: s.medicalQuestionnaireTemplate || null,
    acknowledgementTemplate: s.acknowledgementTemplate || null,
    acknowledgementUnder18Template: s.acknowledgementUnder18Template || null,
    gmailWelcomeTemplate: s.gmailWelcomeTemplate || null,
    smsTemplatePresetVersion: s.smsTemplatePresetVersion || null,
  };
  await sb.from(T.settings_app_config).delete().eq('gym_id', gid);
  await sb.from(T.settings_app_config).insert({
    gym_id: gid,
    fine_sms_enabled: s.fineSmsEnabled !== false,
    fine_sms_grace_days: Number(s.fineSmsGraceDays || 0),
    fine_sms_immediate_roles_json: Array.isArray(s.fineSmsImmediateRoles) ? s.fineSmsImmediateRoles : [],
    finance_use_estimated_expense: s.financeUseEstimatedExpense !== false,
    config_json: configJson,
    updated_at: new Date().toISOString(),
  });

  await sb.from(T.leave_requests).delete().eq('gym_id', gid);
  const leaveRows = (Array.isArray(s.leaveRequests) ? s.leaveRequests : []).map((r) => ({
    gym_id: gid,
    external_request_id: String(r.id || crypto.randomUUID()),
    staff_login_id: String(r.userId || ''),
    leave_type: String(r.type || 'Leave'),
    start_date: toDate(r.startDate),
    end_date: toDate(r.endDate),
    reason: r.reason || null,
    status: String(r.status || 'pending'),
    approved_by: r.approvedBy || null,
    created_at: toTs(r.createdAt) || new Date().toISOString(),
  }));
  for (const part of chunk(leaveRows, 80)) {
    if (part.length) await sb.from(T.leave_requests).insert(part);
  }

  // Attendance persists via /api/attendance/* only — never wipe 17MB+ history from settings bulk.

  await writePtProfiles(s, gid);
  notifyCollectionChange('settings');
}

async function writePtProfiles(settings, gid) {
  if (!Object.prototype.hasOwnProperty.call(settings || {}, 'ptClientProfiles')) return;
  const sb = getSupabase();
  const profiles = settings.ptClientProfiles && typeof settings.ptClientProfiles === 'object'
    ? settings.ptClientProfiles
    : {};

  const members = await fetchAll((from, to) => sb.from(T.members).select('id, member_code').eq('gym_id', gid).range(from, to));
  const codeToId = new Map((members || []).map((m) => [String(m.member_code), m.id]));

  const rows = [];
  for (const [memberCode, profile] of Object.entries(profiles)) {
    const memberId = codeToId.get(memberCode);
    if (!memberId) continue;
    rows.push({
      gym_id: gid,
      member_id: memberId,
      trainer_staff_code: emptyText(profile?.trainer || profile?.trainerId),
      plan_json: profile && typeof profile === 'object' ? profile : {},
      updated_at: new Date().toISOString(),
    });
  }
  for (const part of chunk(rows, 80)) {
    if (part.length) {
      const { error } = await sb.from(T.pt_client_profiles).upsert(part, { onConflict: 'gym_id,member_id' });
      if (error) throw error;
    }
  }
}

/** Replace focusByDate when the patch includes it; spread-merge cannot express day deletions. */
export function mergePtProfilePlanJson(prev, incomingProfile) {
  const prevObj = prev && typeof prev === 'object' ? prev : {};
  const incoming = incomingProfile && typeof incomingProfile === 'object' ? incomingProfile : {};
  const mergedFocus = Object.prototype.hasOwnProperty.call(incoming, 'focusByDate')
    ? { ...(incoming.focusByDate && typeof incoming.focusByDate === 'object' ? incoming.focusByDate : {}) }
    : { ...(prevObj.focusByDate || {}) };
  return {
    ...prevObj,
    ...incoming,
    focusByDate: mergedFocus,
  };
}

/** Surgical PT profile save — shared by staff PATCH and owner bulk sync paths. */
export async function patchPtClientProfile(memberCode, incomingProfile, meta = {}) {
  const code = String(memberCode || '').trim();
  if (!code) throw new Error('member_code_required');
  if (!incomingProfile || typeof incomingProfile !== 'object') throw new Error('profile_required');

  const sb = getSupabase();
  const gid = gymId();
  // Legacy imports may have duplicate member_codes; pick the newest row (maybeSingle throws on >1).
  const { data: memberRows, error: memberErr } = await sb
    .from(T.members)
    .select('id')
    .eq('gym_id', gid)
    .eq('member_code', code)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (memberErr) throw memberErr;
  const memberRow = Array.isArray(memberRows) && memberRows.length ? memberRows[0] : null;
  if (!memberRow?.id) throw new Error('member_not_found');

  const { data: memberPlanRow, error: memberPlanErr } = await sb
    .from(T.members)
    .select('plan_name')
    .eq('id', memberRow.id)
    .single();
  if (memberPlanErr) throw memberPlanErr;
  if (!isPtPlanName(memberPlanRow?.plan_name)) {
    const err = new Error('member_not_pt_eligible');
    err.status = 400;
    throw err;
  }

  const { data: existingRows, error: existingErr } = await sb
    .from(T.pt_client_profiles)
    .select('plan_json')
    .eq('gym_id', gid)
    .eq('member_id', memberRow.id)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (existingErr) throw existingErr;
  const existingRow = Array.isArray(existingRows) && existingRows.length ? existingRows[0] : null;

  const prev = existingRow?.plan_json && typeof existingRow.plan_json === 'object' ? existingRow.plan_json : {};
  const nowIso = new Date().toISOString();
  const merged = {
    ...mergePtProfilePlanJson(prev, incomingProfile),
    updatedAt: nowIso,
    updatedBy: String(meta.updatedBy || incomingProfile.updatedBy || '').trim() || prev.updatedBy || '',
  };
  const row = {
    gym_id: gid,
    member_id: memberRow.id,
    trainer_staff_code: emptyText(merged.trainer || merged.trainerId),
    plan_json: merged,
    updated_at: nowIso,
  };
  const { data: updatedRows, error: updErr } = await sb
    .from(T.pt_client_profiles)
    .update({
      trainer_staff_code: row.trainer_staff_code,
      plan_json: row.plan_json,
      updated_at: row.updated_at,
    })
    .eq('gym_id', gid)
    .eq('member_id', memberRow.id)
    .select('id');
  if (updErr) throw updErr;
  if (!updatedRows?.length) {
    const { error: insErr } = await sb.from(T.pt_client_profiles).insert(row);
    if (insErr) throw insErr;
  }
  notifyCollectionChange('settings');
  return merged;
}

async function readVisitors(scope, branchScope = null) {
  if (branchScope?.staffNoBranch) {
    return [];
  }
  const sb = getSupabase();
  const gid = gymId();
  const visitorsGymCodeReady = await visitorsHaveGymCodeColumn(sb);
  const branchFilter = branchScope?.gymCodeId && visitorsGymCodeReady;
  if (branchScope?.gymCodeId && !visitorsGymCodeReady) {
    return [];
  }
  const rows = await fetchAll((from, to) => {
    let q = sb.from(T.visitors).select('*').eq('gym_id', gid);
    if (branchFilter) {
      q = q.eq('assigned_gym_code_id', branchScope.gymCodeId);
    }
    return q.range(from, to);
  });
  return sandboxFilter((rows || []).map(visitorRowToApp), scope);
}

async function writeVisitors(visitors, scope) {
  const sb = getSupabase();
  const gid = gymId();
  const incoming = sandboxFilter(Array.isArray(visitors) ? visitors : [], scope);
  const includeGymCode = await visitorsHaveGymCodeColumn(sb);
  const rows = incoming
    .filter((v) => v?.id)
    .map((v) => {
      const row = appVisitorToRow(v, gid);
      return includeGymCode ? row : stripVisitorGymCodeColumn(row);
    });
  // Upsert-only: never delete visitors missing from a partial browser upload (prevents mass data loss).
  await syncGymRowsByExternalId(sb, T.visitors, {
    gymId: gid,
    externalIdColumn: 'external_visitor_id',
    rows,
    onConflict: 'gym_id,external_visitor_id',
    deleteOrphans: false,
  });
  notifyCollectionChange('visitors');
}

/**
 * Surgical delete for one visitor by external id (branch-scoped for staff).
 */
export async function deleteVisitorByExternalId(externalVisitorId, branchScope = null) {
  const sb = getSupabase();
  const gid = gymId();
  const extId = String(externalVisitorId || '').trim();
  if (!extId) {
    const err = new Error('visitor-id-required');
    err.status = 400;
    throw err;
  }

  const includeGymCode = await visitorsHaveGymCodeColumn(sb);
  const selectCols = includeGymCode
    ? 'id, external_visitor_id, assigned_gym_code_id'
    : 'id, external_visitor_id';

  const { data: existing, error: selErr } = await sb
    .from(T.visitors)
    .select(selectCols)
    .eq('gym_id', gid)
    .eq('external_visitor_id', extId)
    .maybeSingle();
  if (selErr) throw new Error(`visitor lookup: ${selErr.message}`);
  if (!existing) {
    const err = new Error('visitor-not-found');
    err.status = 404;
    throw err;
  }

  if (branchScope && !branchScope.isOwner) {
    const assigned = includeGymCode ? existing.assigned_gym_code_id : null;
    if (!branchScopeAllowsMember(branchScope, assigned)) {
      const err = new Error('branch-write-forbidden');
      err.status = 403;
      throw err;
    }
  }

  const { error: delErr } = await sb
    .from(T.visitors)
    .delete()
    .eq('gym_id', gid)
    .eq('external_visitor_id', extId);
  if (delErr) throw new Error(`visitor delete: ${delErr.message}`);
  notifyCollectionChange('visitors');
  return { ok: true, id: extId };
}

/**
 * Permanent delete for one member by external member_code (branch-scoped for branch owners).
 * Deletes ALL DB rows sharing member_code (legacy duplicate imports).
 */
export async function deleteMemberByExternalId(externalMemberCode, branchScope = null) {
  const sb = getSupabase();
  const gid = gymId();
  const code = String(externalMemberCode || '').trim();
  if (!code) {
    const err = new Error('member-code-required');
    err.status = 400;
    throw err;
  }

  const existingRows = await fetchAll((from, to) => sb
    .from(T.members)
    .select('id, member_code, assigned_gym_code_id, photo_path')
    .eq('gym_id', gid)
    .eq('member_code', code)
    .order('updated_at', { ascending: false })
    .range(from, to));
  if (!existingRows.length) {
    const err = new Error('member-not-found');
    err.status = 404;
    throw err;
  }

  for (const row of existingRows) {
    if (branchScope && !branchScope.isOwner) {
      if (!branchScopeAllowsMember(branchScope, row.assigned_gym_code_id)) {
        const err = new Error('branch-write-forbidden');
        err.status = 403;
        throw err;
      }
    } else if (branchScope?.gymCodeId && branchScope.isOwner) {
      const assigned = String(row.assigned_gym_code_id || '').trim();
      if (assigned && assigned !== String(branchScope.gymCodeId)) {
        const err = new Error('branch-write-forbidden');
        err.status = 403;
        throw err;
      }
    }
  }

  const memberPks = existingRows.map((r) => r.id).filter(Boolean);
  const { deleteMemberPhotoObject } = await import('../../services/memberPhoto/MemberPhotoStorageManager.js');
  for (const row of existingRows) {
    const path = String(row.photo_path || '').trim();
    if (path) await deleteMemberPhotoObject(path).catch(() => {});
  }
  await deleteMemberChildren(sb, memberPks);
  const deletedAt = new Date().toISOString();
  const deletedBy = String(branchScope?.actorName || branchScope?.actorId || '').trim() || null;
  const { error: softErr } = await sb
    .from(T.members)
    .update({ deleted_at: deletedAt, deleted_by: deletedBy, updated_at: deletedAt })
    .eq('gym_id', gid)
    .eq('member_code', code);
  if (softErr) throw new Error(`member soft-delete: ${softErr.message}`);

  for (const row of existingRows) {
    await recordMemberDeleteAudit(sb, {
      gymId: gid,
      memberCode: code,
      memberPk: row.id,
      deletedBy,
    });
  }

  const remaining = await fetchAll((from, to) => applyActiveMembersFilter(
    sb.from(T.members)
      .select('id')
      .eq('gym_id', gid)
      .eq('member_code', code)
      .range(from, to),
  ));
  if (remaining.length) {
    const err = new Error('member-delete-not-persisted');
    err.status = 500;
    throw err;
  }

  notifyCollectionChange('members');
  notifyCollectionChange('finance');
  return { ok: true, deleted: true, id: code, rowsRemoved: memberPks.length, softDeleted: true };
}

async function readFinance(scope) {
  const sb = getSupabase();
  const gid = gymId();
  const rows = await fetchAll((from, to) => sb.from(T.finance_transactions).select('*').eq('gym_id', gid).range(from, to));
  return sandboxFilter((rows || []).map(financeRowToApp), scope);
}

/**
 * SQL-backed finance summary by payment_transaction_date (paid_at) + manual finance rows.
 * @param {import('../../auth/branchScope.js').resolveReadBranchScope extends Function ? ReturnType<import('../../auth/branchScope.js').resolveReadBranchScope> : object|null} branchScope
 * @param {{ month?: string, year?: string, includeLines?: boolean }} options
 */
async function readFinanceSummary(branchScope, options = {}) {
  const {
    buildMonthSummaryFromRecords,
    buildYearReconciliationFromRecords,
    calendarMonthPaidAtBounds,
    mapDbPaymentsToRecords,
    paymentInCalendarMonth,
  } = await import('../../services/financeSummaryService.js');

  const emptyMonth = (monthKey) => ({
    monthKey,
    dateBasis: 'payment_transaction_date_utc_calendar',
    revenueBasis: 'paid_month_billing_cycle',
    memberPaymentsCollected: 0,
    memberPaymentsService: 0,
    manualIncomeCollected: 0,
    collectedRevenue: 0,
    serviceRevenue: 0,
    paymentCount: 0,
    servicePaymentCount: 0,
    manualIncomeCount: 0,
    expenses: 0,
    actualExpenses: 0,
    profit: 0,
    expenseSubtitle: '',
    useEstimateFallback: false,
  });

  if (branchScope?.staffNoBranch) {
    const monthKey = String(options.month || '').trim();
    if (options.year) {
      return { year: Number(options.year), months: [], dateBasis: 'payment_transaction_date_utc_calendar' };
    }
    return emptyMonth(monthKey);
  }

  const sb = getSupabase();
  const gid = gymId();
  const settings = await readSettingsValue(null);
  const financeRows = await readFinance(null);

  const memberRows = await fetchAll((from, to) => {
    let q = applyActiveMembersFilter(
      sb.from(T.members).select('id, member_code, full_name, status').eq('gym_id', gid),
    );
    if (branchScope?.gymCodeId) {
      if (branchScope.isOwner) {
        q = q.or(`assigned_gym_code_id.eq.${branchScope.gymCodeId},assigned_gym_code_id.is.null`);
      } else {
        q = q.eq('assigned_gym_code_id', branchScope.gymCodeId);
      }
    }
    return q.range(from, to);
  });
  const memberPkToMeta = new Map((memberRows || []).map((r) => [
    r.id,
    {
      member_code: String(r.member_code || ''),
      name: String(r.full_name || ''),
      status: String(r.status || '').trim(),
    },
  ]));
  const activeMemberPks = [...memberPkToMeta.entries()]
    .filter(([, meta]) => String(meta.status || '').toLowerCase() === 'active')
    .map(([pk]) => pk);
  const memberPks = [...memberPkToMeta.keys()];
  const financeMemberPks = activeMemberPks;

  const loadPaymentsInRange = async (fromIso, toExclusiveIso) => {
    const raw = [];
    if (!financeMemberPks.length) return raw;
    for (const idChunk of chunk(financeMemberPks, 100)) {
      const { data, error } = await sb
        .from(T.member_payment_history)
        .select('member_id, paid_at, amount, external_payment_id, method, paid_month, billing_date, billing_month')
        .eq('gym_id', gid)
        .in('member_id', idChunk)
        .gte('paid_at', fromIso)
        .lt('paid_at', toExclusiveIso);
      if (error) throw new Error(`finance_summary payments: ${error.message}`);
      raw.push(...(data || []));
    }
    return mapDbPaymentsToRecords(raw, memberPkToMeta);
  };

  const loadPaymentsForServiceMonth = async (monthKey) => {
    const ledgerRaw = [];
    if (!financeMemberPks.length || !monthKey) return [];
    let ledgerAvailable = true;
    for (const idChunk of chunk(financeMemberPks, 100)) {
      const { data, error } = await sb
        .from(T.member_paid_for_month)
        .select('member_id, member_code, paid_for_month, amount, paid_at, payment_external_id, member_status')
        .eq('gym_id', gid)
        .in('member_id', idChunk)
        .eq('paid_for_month', monthKey)
        .eq('member_status', 'Active');
      if (error) {
        if (/member_paid_for_month|does not exist|42P01/i.test(error.message)) {
          ledgerAvailable = false;
          break;
        }
        throw new Error(`finance_summary paid_for_month ledger: ${error.message}`);
      }
      ledgerRaw.push(...(data || []));
    }
    if (ledgerAvailable && ledgerRaw.length) {
      return mapPaidForMonthLedgerToPaymentRecords(ledgerRaw, memberPkToMeta);
    }
    const raw = [];
    for (const idChunk of chunk(financeMemberPks, 100)) {
      const { data, error } = await sb
        .from(T.member_payment_history)
        .select('member_id, paid_at, amount, external_payment_id, method, paid_month, billing_date, billing_month')
        .eq('gym_id', gid)
        .in('member_id', idChunk)
        .eq('paid_month', monthKey);
      if (error) throw new Error(`finance_summary service payments: ${error.message}`);
      raw.push(...(data || []));
    }
    return mapDbPaymentsToRecords(raw, memberPkToMeta);
  };

  const loadPaymentsForServiceYear = async (year) => {
    const ledgerRaw = [];
    if (!financeMemberPks.length || !year) return [];
    const prefix = `${year}-`;
    let ledgerAvailable = true;
    for (const idChunk of chunk(financeMemberPks, 100)) {
      const { data, error } = await sb
        .from(T.member_paid_for_month)
        .select('member_id, member_code, paid_for_month, amount, paid_at, payment_external_id, member_status')
        .eq('gym_id', gid)
        .in('member_id', idChunk)
        .like('paid_for_month', `${prefix}%`)
        .eq('member_status', 'Active');
      if (error) {
        if (/member_paid_for_month|does not exist|42P01/i.test(error.message)) {
          ledgerAvailable = false;
          break;
        }
        throw new Error(`finance_summary paid_for_month year: ${error.message}`);
      }
      ledgerRaw.push(...(data || []));
    }
    if (ledgerAvailable) {
      return mapPaidForMonthLedgerToPaymentRecords(ledgerRaw, memberPkToMeta);
    }
    const raw = [];
    for (const idChunk of chunk(financeMemberPks, 100)) {
      const { data, error } = await sb
        .from(T.member_payment_history)
        .select('member_id, paid_at, amount, external_payment_id, method, paid_month, billing_date, billing_month')
        .eq('gym_id', gid)
        .in('member_id', idChunk)
        .like('paid_month', `${prefix}%`);
      if (error) throw new Error(`finance_summary service year payments: ${error.message}`);
      raw.push(...(data || []));
    }
    return mapDbPaymentsToRecords(raw, memberPkToMeta);
  };

  if (options.year) {
    const year = Number(options.year);
    if (!year) {
      return { year: 0, months: [], dateBasis: 'payment_transaction_date_utc_calendar' };
    }
    const fromIso = `${year}-01-01T00:00:00.000Z`;
    const toExclusiveIso = `${year + 1}-01-01T00:00:00.000Z`;
    const collectedRecords = await loadPaymentsInRange(fromIso, toExclusiveIso);
    const serviceRecords = await loadPaymentsForServiceYear(year);
    const paymentById = new Map();
    for (const p of [...collectedRecords, ...serviceRecords]) {
      paymentById.set(String(p.id || ''), p);
    }
    const paymentRecords = [...paymentById.values()].filter((p) => p.id);
    const months = buildYearReconciliationFromRecords(
      paymentRecords,
      financeRows,
      year,
      settings,
    );
    return {
      year,
      dateBasis: 'payment_transaction_date_utc_calendar',
      revenueBasis: 'paid_month_billing_cycle',
      totalPaymentsInYear: collectedRecords.length,
      months,
    };
  }

  const monthKey = String(options.month || '').trim();
  const bounds = calendarMonthPaidAtBounds(monthKey);
  if (!bounds) {
    const err = new Error('invalid_month');
    err.status = 400;
    throw err;
  }
  const includeLines = Boolean(options.includeLines);
  const ledgerReady = await memberPaidForMonthLedgerReady(sb);
  let ledgerServiceSum = 0;
  const ledgerFastPath = !includeLines && ledgerReady;
  if (ledgerFastPath) {
    ledgerServiceSum = await sumPaidForMonthLedger(sb, gid, monthKey, financeMemberPks);
  }

  let collectedRecords = [];
  let serviceRecords = [];
  let paymentRecords = [];
  let summary;
  if (ledgerFastPath) {
    collectedRecords = await loadPaymentsInRange(bounds.from, bounds.toExclusive);
    summary = buildMonthSummaryFromRecords([], financeRows, monthKey, settings, false);
  } else {
    collectedRecords = await loadPaymentsInRange(bounds.from, bounds.toExclusive);
    serviceRecords = await loadPaymentsForServiceMonth(monthKey);
    const paymentById = new Map();
    for (const p of [...collectedRecords, ...serviceRecords]) {
      paymentById.set(String(p.id || ''), p);
    }
    paymentRecords = [...paymentById.values()].filter((p) => p.id);
    summary = buildMonthSummaryFromRecords(
      paymentRecords,
      financeRows,
      monthKey,
      settings,
      includeLines,
    );
    if (ledgerReady) {
      ledgerServiceSum = await sumPaidForMonthLedger(sb, gid, monthKey, financeMemberPks);
    }
  }
  const manualIncome = Number(summary.manualIncomeCollected || 0);
  const collectedPaymentSum = (collectedRecords || []).reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0,
  );
  const collectedFromLedger = (ledgerFastPath ? collectedPaymentSum : Number(summary.memberPaymentsCollected || 0))
    + manualIncome;
  let serviceFromPayments = ledgerServiceSum;
  let serviceRevenueBasis = ledgerServiceSum > 0
    ? 'member_paid_for_month_active_ledger'
    : summary.revenueBasis;
  if (ledgerReady && ledgerServiceSum === 0) {
    const { sumServiceRevenueFromPaymentRecords } = await import(
      '../../../src/features/finance/aggregateFinanceSummary.js'
    );
    serviceRecords = await loadPaymentsForServiceMonth(monthKey);
    serviceFromPayments = sumServiceRevenueFromPaymentRecords(serviceRecords, monthKey);
    if (serviceFromPayments > 0) {
      serviceRevenueBasis = 'paid_month_payment_history_active_fallback';
    }
  }
  const prevMonthCollected = await (async () => {
    const prevKey = (() => {
      const [y, m] = monthKey.split('-').map(Number);
      if (!y || !m) return '';
      const d = new Date(Date.UTC(y, m - 2, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    })();
    const prevBounds = calendarMonthPaidAtBounds(prevKey);
    if (!prevBounds) return 0;
    try {
      const prevRecords = await loadPaymentsInRange(prevBounds.from, prevBounds.toExclusive);
      const prevPaymentSum = (prevRecords || []).reduce(
        (sum, p) => sum + Number(p.amount || 0),
        0,
      );
      const prevManual = (Array.isArray(financeRows) ? financeRows : [])
        .filter((t) => t && t.type !== 'expense' && paymentInCalendarMonth(t.date, prevKey))
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
      return prevPaymentSum + prevManual;
    } catch {
      return 0;
    }
  })();
  const expenseProfit = summary.expenses != null
    ? {
      expense: summary.expenses,
      actualExpense: summary.actualExpenses,
      profit: collectedFromLedger - Number(summary.expenses || 0),
      expenseSubtitle: summary.expenseSubtitle,
      useEstimateFallback: summary.useEstimateFallback,
    }
    : { expense: 0, profit: collectedFromLedger, expenseSubtitle: '', useEstimateFallback: false };
  const growthPct = prevMonthCollected > 0
    ? Math.round(((collectedFromLedger - prevMonthCollected) / prevMonthCollected) * 1000) / 10
    : (collectedFromLedger > 0 ? 100 : 0);
  return {
    ...summary,
    collectedRevenue: collectedFromLedger,
    serviceRevenue: serviceFromPayments + manualIncome,
    memberPaymentsCollected: collectedPaymentSum,
    memberPaymentsService: ledgerServiceSum || serviceFromPayments,
    profit: expenseProfit.profit,
    revenueGrowthPct: growthPct,
    prevMonthCollected,
    collectedRevenueBasis: 'payment_transaction_date_utc_calendar',
    serviceRevenueBasis,
    revenueBasis: serviceRevenueBasis,
    dateBasis: 'payment_transaction_date_utc_calendar',
    dbLedgerServiceSum: ledgerServiceSum,
    dbLedgerActiveSum: ledgerServiceSum,
    dbServiceMonthFallbackSum: serviceFromPayments,
    dbActiveMemberCount: activeMemberPks.length,
    dbPaymentRowsInRange: collectedRecords.length,
    dbServicePaymentRowsInMonth: serviceRecords.length,
    scopedMemberCount: memberPks.length,
  };
}

async function writeFinance(finance, scope) {
  const sb = getSupabase();
  const gid = gymId();
  const incoming = sandboxFilter(Array.isArray(finance) ? finance : [], scope);

  const members = await fetchAll((from, to) => sb.from(T.members).select('id, member_code').eq('gym_id', gid).range(from, to));
  const codeToId = new Map((members || []).map((m) => [String(m.member_code), m.id]));

  const rows = incoming.map((t) => appFinanceToRow(t, gid, t.memberId ? codeToId.get(String(t.memberId)) || null : null));
  await syncGymRowsByExternalId(sb, T.finance_transactions, {
    gymId: gid,
    externalIdColumn: 'external_tx_id',
    rows,
    onConflict: 'gym_id,external_tx_id',
  });
  notifyCollectionChange('finance');
}

let auditLogsGymScoped;
let auditLogsBranchScoped;

async function auditLogsHasGymColumn(sb) {
  if (auditLogsGymScoped !== undefined) return auditLogsGymScoped;
  const { error } = await sb.from(T.audit_logs).select('gym_id').limit(0);
  auditLogsGymScoped = !(error && String(error.message || '').includes('gym_id'));
  return auditLogsGymScoped;
}

async function auditLogsHasBranchColumn(sb) {
  if (auditLogsBranchScoped !== undefined) return auditLogsBranchScoped;
  const { error } = await sb.from(T.audit_logs).select('branch_id').limit(0);
  auditLogsBranchScoped = !(error && String(error.message || '').includes('branch_id'));
  return auditLogsBranchScoped;
}

function applyAuditLogBranchReadFilter(q, branchScope, hasBranchCol) {
  if (!hasBranchCol || !branchScope) return q;
  if (branchScope.staffNoBranch) {
    return q.eq('branch_id', '__apg_no_branch__');
  }
  const code = String(branchScope.gymCodeId || branchScope.allowedBranchIds?.[0] || '').trim();
  if (!code) return q;
  return q.or(`branch_id.eq.${code},branch_id.is.null`);
}

async function readLogs(scope, options = {}, branchScope = null) {
  const sb = getSupabase();
  const gid = gymId();
  const gymScoped = await auditLogsHasGymColumn(sb);
  const branchColReady = await auditLogsHasBranchColumn(sb);
  const hasPaging = options.limit != null || options.offset != null || options.days != null
    || options.startDate != null || options.endDate != null || options.view != null;

  if (!hasPaging) {
    const rows = await fetchAll((from, to) => {
      let q = sb.from(T.audit_logs).select('*').order('logged_at', { ascending: false });
      if (gymScoped) q = q.eq('gym_id', gid);
      q = applyAuditLogBranchReadFilter(q, branchScope, branchColReady);
      return q.range(from, to);
    });
    return sandboxFilter((rows || []).map((row) => logRowToApp(row)), scope);
  }

  const slim = options.view !== 'full';
  const columns = slim ? LOG_LIST_COLUMNS : '*';
  const limit = Math.min(Math.max(Number(options.limit) || 500, 1), 50000);
  const offset = Math.max(Number(options.offset) || 0, 0);
  const days = Math.min(Math.max(Number(options.days) || 90, 1), 2555);
  const startIso = toTs(options.startDate);
  const endIso = toTs(options.endDate);
  const pageSize = 1000;

  const buildPagedQuery = () => {
    let q = sb.from(T.audit_logs).select(columns).order('logged_at', { ascending: false });
    if (gymScoped) q = q.eq('gym_id', gid);
    q = applyAuditLogBranchReadFilter(q, branchScope, branchColReady);
    if (startIso) q = q.gte('logged_at', startIso);
    else q = q.gte('logged_at', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());
    if (endIso) q = q.lte('logged_at', endIso);
    return q;
  };

  const rows = [];
  let cursor = offset;
  while (rows.length < limit) {
    const chunkSize = Math.min(pageSize, limit - rows.length);
    const from = cursor;
    const to = cursor + chunkSize - 1;
    const { data, error } = await buildPagedQuery().range(from, to);
    if (error) throw new Error(`audit_logs read: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < chunkSize) break;
    cursor += data.length;
  }
  return sandboxFilter(rows.map((row) => logRowToApp(row, { slim })), scope);
}

async function writeLogs(logs, scope) {
  const sb = getSupabase();
  const gid = gymId();
  const incoming = sandboxFilter(Array.isArray(logs) ? logs : [], scope);
  const gymScoped = await auditLogsHasGymColumn(sb);
  if (!incoming.length) {
    notifyCollectionChange('logs');
    return;
  }
  const rows = incoming.map((l) => {
    const row = appLogToRow(l, gid);
    if (!gymScoped) delete row.gym_id;
    return row;
  });
  if (gymScoped) {
    await syncGymRowsByExternalId(sb, T.audit_logs, {
      gymId: gid,
      externalIdColumn: 'external_log_id',
      rows,
      onConflict: 'gym_id,external_log_id',
      deleteOrphans: false,
    });
  } else {
    for (const row of rows) {
      const extId = row.external_log_id;
      await sb.from(T.audit_logs).delete().eq('external_log_id', extId);
      const { error } = await sb.from(T.audit_logs).insert(row);
      if (error) throw new Error(`audit_logs insert ${extId}: ${error.message}`);
    }
  }
  notifyCollectionChange('logs');
}

async function readSmsEvents(scope) {
  const sb = getSupabase();
  const gid = gymId();
  const rows = await fetchAll((from, to) => sb.from(T.sms_status_events).select('*').eq('gym_id', gid).order('event_at', { ascending: false }).range(from, to));
  return sandboxFilter((rows || []).map(smsRowToApp), scope);
}

async function writeSmsEvents(events, scope) {
  const sb = getSupabase();
  const gid = gymId();
  const incoming = sandboxFilter(Array.isArray(events) ? events : [], scope);
  const rows = incoming.map((e) => appSmsToRow(e, gid));
  await syncGymRowsByExternalId(sb, T.sms_status_events, {
    gymId: gid,
    externalIdColumn: 'external_event_id',
    rows,
    onConflict: 'gym_id,external_event_id',
  });
  notifyCollectionChange('smsEvents');
}

export async function readCollection(key, fallback = [], scope = null, branchScope = null, options = {}) {
  switch (key) {
    case KEY_MEMBERS:
      return readMembers(scope, branchScope, options);
    case KEY_USERS:
      return readUsers(scope);
    case KEY_VISITORS:
      return readVisitors(scope, branchScope);
    case KEY_LOGS:
      return readLogs(scope, options, branchScope);
    case KEY_FINANCE:
      return readFinance(scope);
    case KEY_SMS:
      return readSmsEvents(scope);
    default:
      return fallback;
  }
}

export async function overrideMemberPaidForMonthAmount(
  memberCode,
  monthKey,
  newAmount,
  branchScope,
  { changedBy, overrideReason, confirmOverride = false } = {},
) {
  const sb = getSupabase();
  const gid = gymId();
  const code = String(memberCode || '').trim();
  const member = await readMemberByCode(code, branchScope);
  if (!member) {
    const err = new Error('member-not-found');
    err.status = 404;
    throw err;
  }
  const { data: memberRow, error: rowErr } = await sb
    .from(T.members)
    .select('id')
    .eq('gym_id', gid)
    .eq('member_code', code)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (rowErr) throw new Error(`member pk lookup: ${rowErr.message}`);
  if (!memberRow?.id) {
    const err = new Error('member-not-found');
    err.status = 404;
    throw err;
  }
  const existing = await readMemberPaidForMonthLedgerRow(sb, gid, memberRow.id, monthKey);
  const oldAmount = Number(existing?.amount || 0);
  const amount = Number(newAmount);
  if (existing && oldAmount !== amount && !confirmOverride) {
    const err = new Error('amount-override-confirmation-required');
    err.status = 409;
    err.detail = {
      paidForMonth: monthKey,
      existingAmount: oldAmount,
      requestedAmount: amount,
    };
    throw err;
  }
  const result = await patchMemberPaidForMonthAmount(sb, {
    gymId: gid,
    memberPk: memberRow.id,
    memberCode: code,
    monthKey,
    newAmount,
    changedBy,
    overrideReason,
  });
  notifyCollectionChange('finance');
  notifyCollectionChange('members');
  return { ...result, memberId: code };
}

export {
  updateMemberFields,
  readMemberByCode,
  assertStaffPaymentDeletesAllowed,
  readFinanceSummary,
};

export async function writeCollection(key, value, scope = null, options = null) {
  switch (key) {
    case KEY_MEMBERS:
      return writeMembers(value, scope, options || {});
    case KEY_USERS:
      return writeUsers(value, scope);
    case KEY_VISITORS:
      return writeVisitors(value, scope);
    case KEY_LOGS:
      return writeLogs(value, scope);
    case KEY_FINANCE:
      return writeFinance(value, scope);
    case KEY_SMS:
      return writeSmsEvents(value, scope);
    default:
      return;
  }
}

export async function readSettingsValue(scope = null, options = {}) {
  return readSettings(scope, options);
}

export async function writeSettingsValue(value, scope = null) {
  return writeSettings(value, scope);
}

/** Owner-only surgical role template sync (avoids settings bulk insert races). */
export async function writeRoleTemplatesValue(roleTemplates, scope = null) {
  if (scope) return dedupeRoleTemplates(roleTemplates);
  const sb = getSupabase();
  const gid = gymId();
  await cleanupDuplicateRoleTemplateRows(sb, gid);
  const saved = await syncRoleTemplatesToDb(sb, gid, roleTemplates);
  notifyCollectionChange('settings');
  return saved;
}

export async function purgeSandbox(sandboxId) {
  const scope = { sandboxId: String(sandboxId || '').trim() };
  if (!scope.sandboxId) return;
  await writeMembers([], scope);
  await writeUsers([], scope);
  await writeVisitors([], scope);
  await writeFinance([], scope);
  await writeLogs([], scope);
  await writeSmsEvents([], scope);
}

function attendanceAppToRow(gid, r) {
  return {
    gym_id: gid,
    external_record_id: String(r.id || crypto.randomUUID()),
    staff_login_id: String(r.userId || ''),
    attendance_date: toDate(r.date),
    status: String(r.status || 'Present'),
    check_in: r.checkIn || null,
    check_out: r.checkOut || null,
    note: r.note || null,
    first_login_at: toTs(r.firstLoginAt),
    last_logout_at: toTs(r.lastLogoutAt),
    auto_present_window_until: toTs(r.autoPresentWindowUntil),
    timezone_at_mark: r.timeZoneAtMark || null,
    auto_marked: Boolean(r.autoMarked),
    marked_by: r.markedBy || null,
    leave_request_id: r.leaveRequestId || null,
    leave_auto_synced: Boolean(r.leaveAutoSynced),
    updated_by: r.updatedBy || null,
    created_at: toTs(r.updatedAt) || new Date().toISOString(),
    updated_at: toTs(r.updatedAt) || new Date().toISOString(),
  };
}

function attendanceRowToApp(r) {
  return {
    id: r.external_record_id,
    userId: r.staff_login_id,
    date: r.attendance_date,
    status: r.status,
    checkIn: r.check_in,
    checkOut: r.check_out,
    note: r.note,
    firstLoginAt: r.first_login_at,
    lastLogoutAt: r.last_logout_at,
    autoPresentWindowUntil: r.auto_present_window_until,
    timeZoneAtMark: r.timezone_at_mark,
    autoMarked: r.auto_marked,
    markedBy: r.marked_by,
    leaveRequestId: r.leave_request_id,
    leaveAutoSynced: r.leave_auto_synced,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
  };
}

async function upsertAttendanceRow(sb, gid, appRecord) {
  const row = attendanceAppToRow(gid, appRecord);
  const { error } = await sb.from(T.staff_attendance_records).upsert(row, {
    onConflict: 'gym_id,external_record_id',
  });
  if (!error) return;
  await sb.from(T.staff_attendance_records)
    .delete()
    .eq('gym_id', gid)
    .eq('external_record_id', row.external_record_id);
  const { error: insErr } = await sb.from(T.staff_attendance_records).insert(row);
  if (insErr) throw new Error(`staff_attendance_records: ${insErr.message}`);
}

/**
 * Login/logout punch for the authenticated staff member (today).
 */
export async function punchStaffAttendance(_scope, { userId, punchType, atIso, timeZone, actorName }) {
  const sb = getSupabase();
  const gid = gymId();
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('userId required');
  const at = atIso || new Date().toISOString();
  const today = toDate(at);
  const actor = actorName || uid;
  const nowIso = at;

  const { data: existing, error: selErr } = await sb
    .from(T.staff_attendance_records)
    .select('*')
    .eq('gym_id', gid)
    .eq('staff_login_id', uid)
    .eq('attendance_date', today)
    .maybeSingle();
  if (selErr) throw selErr;

  let appRecord;
  if (punchType === 'logout') {
    if (existing) {
      appRecord = {
        ...attendanceRowToApp(existing),
        lastLogoutAt: nowIso,
        updatedAt: nowIso,
        updatedBy: actor,
      };
    } else {
      appRecord = {
        id: crypto.randomUUID(),
        date: today,
        userId: uid,
        status: 'Present',
        checkIn: '',
        checkOut: '',
        note: '',
        firstLoginAt: '',
        lastLogoutAt: nowIso,
        autoPresentWindowUntil: '',
        timeZoneAtMark: timeZone || null,
        autoMarked: false,
        markedBy: actor,
        updatedAt: nowIso,
        updatedBy: actor,
      };
    }
  } else {
    const windowUntil = new Date(new Date(nowIso).getTime() + (24 * 60 * 60 * 1000)).toISOString();
    if (existing) {
      const base = attendanceRowToApp(existing);
      appRecord = {
        ...base,
        status: 'Present',
        autoPresentWindowUntil: base.autoPresentWindowUntil || windowUntil,
        autoMarked: true,
        timeZoneAtMark: base.timeZoneAtMark || timeZone || null,
        firstLoginAt: base.firstLoginAt || nowIso,
        updatedAt: nowIso,
        updatedBy: actor,
      };
    } else {
      appRecord = {
        id: crypto.randomUUID(),
        date: today,
        userId: uid,
        status: 'Present',
        checkIn: '',
        checkOut: '',
        note: '',
        firstLoginAt: nowIso,
        lastLogoutAt: '',
        autoPresentWindowUntil: windowUntil,
        timeZoneAtMark: timeZone || null,
        autoMarked: true,
        markedBy: actor,
        updatedAt: nowIso,
        updatedBy: actor,
      };
    }
  }

  await upsertAttendanceRow(sb, gid, appRecord);
  notifyCollectionChange('settings');
  return appRecord;
}

const ATTENDANCE_LIST_COLUMNS = [
  'external_record_id',
  'staff_login_id',
  'attendance_date',
  'status',
  'check_in',
  'check_out',
  'note',
  'first_login_at',
  'last_logout_at',
  'auto_present_window_until',
  'timezone_at_mark',
  'auto_marked',
  'marked_by',
  'leave_request_id',
  'leave_auto_synced',
  'updated_by',
  'updated_at',
].join(', ');

/** Date-bounded attendance read for GET /api/attendance/records (egress-safe). */
export async function readStaffAttendanceInRange(_scope, { startDate, endDate }) {
  const sb = getSupabase();
  const gid = gymId();
  const start = String(startDate || '').slice(0, 10);
  const end = String(endDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    throw new Error('startDate and endDate must be YYYY-MM-DD');
  }
  if (start > end) throw new Error('startDate must be <= endDate');
  const rows = await fetchAll((from, to) =>
    sb.from(T.staff_attendance_records)
      .select(ATTENDANCE_LIST_COLUMNS)
      .eq('gym_id', gid)
      .gte('attendance_date', start)
      .lte('attendance_date', end)
      .order('attendance_date', { ascending: false })
      .range(from, to));
  return (rows || []).map((r) => attendanceRowToApp(r));
}

/** Upsert one or more attendance rows without wiping the gym table. */
export async function upsertStaffAttendanceRecords(_scope, appRecords = []) {
  const sb = getSupabase();
  const gid = gymId();
  const list = Array.isArray(appRecords) ? appRecords : [];
  for (const rec of list) {
    if (!rec?.userId || !rec?.date) continue;
    await upsertAttendanceRow(sb, gid, rec);
  }
  if (list.length) notifyCollectionChange('settings');
  return list.length;
}

/**
 * Owner-only bulk delete: removes attendance rows where attendance_date is
 * inside [startDate, endDate] (inclusive, ISO calendar dates: YYYY-MM-DD).
 * Returns the count actually deleted.
 */
export async function deleteAttendanceRecordsInRange(_scope, { startDate, endDate }) {
  const sb = getSupabase();
  const gid = gymId();
  const start = String(startDate || '').slice(0, 10);
  const end = String(endDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    throw new Error('startDate and endDate must be YYYY-MM-DD');
  }
  if (start > end) {
    throw new Error('startDate must be <= endDate');
  }
  // Two-step: select ids first so we can report exact deleted count even when
  // Postgres returns no count metadata. Then perform the delete.
  const { data: doomed, error: selErr } = await sb
    .from(T.staff_attendance_records)
    .select('id')
    .eq('gym_id', gid)
    .gte('attendance_date', start)
    .lte('attendance_date', end);
  if (selErr) throw selErr;
  const ids = (doomed || []).map((r) => r.id);
  if (!ids.length) return { deleted: 0 };
  for (const idBatch of chunk(ids, 200)) {
    const { error } = await sb
      .from(T.staff_attendance_records)
      .delete()
      .eq('gym_id', gid)
      .in('id', idBatch);
    if (error) throw error;
  }
  notifyCollectionChange('settings');
  return { deleted: ids.length };
}

/**
 * Owner-only fast path for log cleanup. The legacy collection round-trip
 * (read → filter → writeLogs → syncGymRowsByExternalId) is correct but
 * O(total_rows), which is unusable on a populated gym. This helper issues a
 * single SQL DELETE against audit_logs filtered by logged_at and the active
 * gym scope. Returns the count actually deleted.
 */
export async function deleteAuditLogsInRange(_scope, { startIso, endIso }) {
  const sb = getSupabase();
  const gid = gymId();
  if (!startIso || !endIso) throw new Error('startIso and endIso required');
  const gymScoped = await auditLogsHasGymColumn(sb);
  let countQuery = sb
    .from(T.audit_logs)
    .select('id', { count: 'exact', head: true })
    .gte('logged_at', startIso)
    .lte('logged_at', endIso);
  if (gymScoped) countQuery = countQuery.eq('gym_id', gid);
  const { count, error: countErr } = await countQuery;
  if (countErr) throw countErr;
  let deleteQuery = sb
    .from(T.audit_logs)
    .delete()
    .gte('logged_at', startIso)
    .lte('logged_at', endIso);
  if (gymScoped) deleteQuery = deleteQuery.eq('gym_id', gid);
  const { error: delErr } = await deleteQuery;
  if (delErr) throw delErr;
  notifyCollectionChange('logs');
  return { deleted: count || 0 };
}

export async function deleteAuditLogsByIds(_scope, ids = []) {
  const sb = getSupabase();
  const gid = gymId();
  const wanted = [...new Set((Array.isArray(ids) ? ids : []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (!wanted.length) return { deleted: 0 };
  const gymScoped = await auditLogsHasGymColumn(sb);
  let deleted = 0;
  for (const batch of chunk(wanted, 200)) {
    let q = sb.from(T.audit_logs).delete().in('external_log_id', batch).select('id');
    if (gymScoped) q = q.eq('gym_id', gid);
    let { data, error } = await q;
    if (error) {
      q = sb.from(T.audit_logs).delete().in('id', batch).select('id');
      if (gymScoped) q = q.eq('gym_id', gid);
      ({ data, error } = await q);
    }
    if (error) throw error;
    deleted += Array.isArray(data) ? data.length : 0;
  }
  if (deleted) notifyCollectionChange('logs');
  return { deleted };
}

/**
 * Surgical single-row audit log create with read-back verify (mirrors payment POST).
 */
export async function createAuditLog(entry, branchScope = null) {
  if (!entry || typeof entry !== 'object') {
    const err = new Error('log-entry-required');
    err.status = 400;
    throw err;
  }
  const action = String(entry.action || '').trim();
  if (!action) {
    const err = new Error('action-required');
    err.status = 400;
    throw err;
  }

  const extId = String(entry.id || crypto.randomUUID()).trim();
  const branchId = String(
    entry.branchId
    || branchScope?.gymCodeId
    || branchScope?.allowedBranchIds?.[0]
    || '',
  ).trim();
  const stamped = {
    ...entry,
    id: extId,
    branchId,
    branchName: String(entry.branchName || '').trim(),
    actorId: String(entry.actorId || entry.actor || '').trim(),
    actorRole: String(entry.actorRole || '').trim(),
    ts: entry.ts || new Date().toISOString(),
  };

  const sb = getSupabase();
  const gid = gymId();
  const row = appLogToRow(stamped, gid);
  const gymScoped = await auditLogsHasGymColumn(sb);
  const branchColReady = await auditLogsHasBranchColumn(sb);
  if (!gymScoped) delete row.gym_id;
  if (!branchColReady) {
    delete row.branch_id;
    delete row.branch_name;
    delete row.actor_id;
    delete row.actor_role;
    delete row.summary;
  }

  const { error: insertErr } = await sb.from(T.audit_logs).insert(row);
  if (insertErr) {
    const msg = String(insertErr.message || insertErr);
    if (!/duplicate|unique|23505/i.test(msg)) {
      const err = new Error(`audit_logs insert: ${msg}`);
      err.status = 500;
      throw err;
    }
  }

  let readQuery = sb.from(T.audit_logs).select('*').eq('external_log_id', extId).limit(1);
  if (gymScoped) readQuery = readQuery.eq('gym_id', gid);
  const { data: readRows, error: readErr } = await readQuery;
  if (readErr) {
    const err = new Error(`audit_logs read-back: ${readErr.message}`);
    err.status = 500;
    throw err;
  }
  const persisted = Array.isArray(readRows) ? readRows[0] : null;
  if (!persisted) {
    const err = new Error('log-create-not-persisted');
    err.status = 500;
    throw err;
  }
  if (String(persisted.action || '').trim() !== action) {
    const err = new Error('log-create-not-persisted');
    err.status = 500;
    throw err;
  }

  notifyCollectionChange('logs');
  return {
    ok: true,
    created: !insertErr,
    log: logRowToApp(persisted),
  };
}

/**
 * Lightweight, single-row audit log insert. The legacy writeLogs path
 * round-trips the entire audit_logs collection through syncGymRowsByExternalId
 * — that's correct but ruinous when the only goal is "append one row".
 * This helper does exactly that and nothing more.
 */
export async function insertAuditLogRow(_scope, entry) {
  try {
    await createAuditLog(entry);
  } catch (err) {
    console.error('[apg] insertAuditLogRow failed', err?.message || err);
  }
}

/** @deprecated Use getBranchWhatsappTemplates via dataStore.readWhatsappTemplates(scope, gymCodeId) */
export async function getWhatsappTemplates(_scope, gymCodeId) {
  const { getBranchWhatsappTemplates } = await import('../../services/branchWhatsappTemplates.js');
  const result = await getBranchWhatsappTemplates(gymCodeId);
  return { templates: result.templates, updatedAt: result.updatedAt };
}

/** Branch-scoped surgical template upsert. */
export async function upsertWhatsappTemplate(_scope, { key, body, gymCodeId }) {
  const { upsertBranchWhatsappTemplate } = await import('../../services/branchWhatsappTemplates.js');
  const saved = await upsertBranchWhatsappTemplate(gymCodeId, { key, body });
  notifyCollectionChange('settings');
  return saved;
}

/**
 * Hard-delete the staff rows whose staff_login_id is in `loginIds`. Owner-gated
 * at the route layer. Returns { deleted: [], skipped: [] } where deleted lists
 * staff_login_id values that were actually removed. Cleans up dependent
 * sections/access rows first to avoid FK violations.
 *
 * NB: `writeUsers` above is intentionally upsert-only to protect production
 * (a partial browser PUT must never wipe accounts). Cleanup is the only path
 * that may destructively delete staff and therefore goes through this fn.
 */
export async function deleteStaffUsers(_scope, loginIds = []) {
  const sb = getSupabase();
  const gid = gymId();
  const wantedRaw = (Array.isArray(loginIds) ? loginIds : [])
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  if (!wantedRaw.length) return { deleted: [], skipped: [] };
  const wantedNorm = new Set(wantedRaw.map((id) => id.toLowerCase()));

  // Resolve PKs for this gym, then match case-insensitively so "reception"
  // and "Reception" both map to the same staff_login_id row.
  const { data: rows, error: lookupErr } = await sb
    .from(T.staff_users)
    .select('id, staff_login_id')
    .eq('gym_id', gid);
  if (lookupErr) throw new Error(`staff lookup failed: ${lookupErr.message}`);

  const present = (rows || []).filter((r) => {
    if (!r || !r.id || !r.staff_login_id) return false;
    return wantedNorm.has(String(r.staff_login_id).trim().toLowerCase());
  });
  if (!present.length) return { deleted: [], skipped: wantedRaw };

  const pks = present.map((r) => r.id);
  const removedLogins = present.map((r) => String(r.staff_login_id));

  // Best-effort dependent cleanup; ignore errors here so the staff row delete
  // below remains the canonical source of truth for the operation's success.
  await sb.from(T.staff_user_sections).delete().in('staff_user_id', pks).then(() => {}, () => {});
  await sb.from(T.staff_user_access).delete().in('staff_user_id', pks).then(() => {}, () => {});

  const { error: delErr } = await sb
    .from(T.staff_users)
    .delete()
    .in('id', pks)
    .eq('gym_id', gid);
  if (delErr) throw new Error(`staff delete failed: ${delErr.message}`);

  for (const id of removedLogins) invalidateStaffAccessCache(id);
  notifyCollectionChange('users');

  const removedNorm = new Set(removedLogins.map((id) => String(id).trim().toLowerCase()));
  const skipped = wantedRaw.filter((id) => !removedNorm.has(String(id).trim().toLowerCase()));
  return { deleted: removedLogins, skipped };
}

export async function ping() {
  const sb = getSupabase();
  const { error } = await sb.from(T.gyms).select('id').eq('id', gymId()).maybeSingle();
  if (error) throw error;
  return true;
}
