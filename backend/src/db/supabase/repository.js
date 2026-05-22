import crypto from 'node:crypto';
import { ALL_SECTIONS } from '../../../../src/features/access/permissions.js';
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
  messageRowToApp,
  paymentRowToApp,
  smsRowToApp,
  staffRowToApp,
  visitorRowToApp,
} from './mappers.js';
import { invalidateStaffAccessCache } from '../../auth/accessControl.js';
import { hashPassword } from '../../auth/passwords.js';
import { syncGymRowsByExternalId, syncMemberChildRows } from './collectionSync.js';
import { bulkUpsertMemberRows, membersBulkUpsertReady } from './membersWrite.js';
import { chunk, emptyText, fetchAll, toDate, toTs } from './utils.js';

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
        createdAt: row.created_at,
        ts: row.created_at,
      });
      injuryByMember.set(row.member_id, list);
    }
  }

  return { paymentsByMember, messagesByMember, attachmentsByMember, injuryByMember };
}

async function readMembers(scope, branchScope = null) {
  const sb = getSupabase();
  const gid = gymId();
  const memberRows = await fetchAll((from, to) => {
    let q = sb.from(T.members).select('*').eq('gym_id', gid);
    // Phase 2 zero-leak: when caller passes a branchScope (non-owner staff with a gym_code_id),
    // we filter at the SQL layer so that cross-branch (and NULL/legacy) rows never leave Supabase.
    if (branchScope && branchScope.gymCodeId) {
      q = q.eq('assigned_gym_code_id', branchScope.gymCodeId);
    }
    return q.range(from, to);
  });
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

  // We tolerate (data-anomaly) duplicate member_codes by picking the most recently
  // updated row. .maybeSingle() throws on >1 — that's correct for assertions but
  // unhelpful when the legacy snapshot has accidental dupes from old imports.
  const { data: dupRows, error: selErr } = await sb
    .from(T.members)
    .select('id, gym_id, member_code, assigned_gym_code_id, updated_at')
    .eq('gym_id', gid)
    .eq('member_code', code)
    .order('updated_at', { ascending: false })
    .limit(1);
  if (selErr) throw new Error(`member lookup: ${selErr.message}`);
  const existingRow = Array.isArray(dupRows) && dupRows.length ? dupRows[0] : null;
  if (!existingRow) {
    const err = new Error('member-not-found');
    err.status = 404;
    throw err;
  }

  if (branchScope && branchScope.gymCodeId && !branchScope.isOwner) {
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
      if (want && want !== String(branchScope.gymCodeId)) {
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

  const children = await loadMemberChildren(sb, gid, [refreshed.id]);
  notifyCollectionChange('members');

  return memberRowToApp(refreshed, {
    payments: children.paymentsByMember.get(refreshed.id) || [],
    messages: children.messagesByMember.get(refreshed.id) || [],
    attachments: children.attachmentsByMember.get(refreshed.id) || [],
    injuryNotes: children.injuryByMember.get(refreshed.id) || [],
  });
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

async function deleteMemberChildren(sb, memberIds) {
  if (!memberIds.length) return;
  for (const idChunk of chunk(memberIds, 100)) {
    await Promise.all([
      sb.from(T.member_payment_history).delete().in('member_id', idChunk),
      sb.from(T.member_message_history).delete().in('member_id', idChunk),
      sb.from(T.member_attachments).delete().in('member_id', idChunk),
      sb.from(T.member_injury_notes).delete().in('member_id', idChunk),
    ]);
  }
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
    payRows.push({
      gym_id: gid,
      member_id: memberPk,
      external_payment_id: p.id ? String(p.id) : crypto.randomUUID(),
      paid_at: toTs(p.paidAt || p.receivedAt || p.date || p.ts) || new Date().toISOString(),
      amount: Number(p.amount || 0),
      method: emptyText(p.method || p.paymentMethod),
      billing_month: emptyText(p.billingMonth),
      billing_date: toDate(p.billingDate, { required: true }),
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
        created_at: toTs(n.createdAt || n.ts) || new Date().toISOString(),
      });
    }
  }

  return { payRows, msgRows, attRows, injuryRows };
}

async function writeMembers(members, scope) {
  const sb = getSupabase();
  const gid = gymId();
  const incoming = sandboxFilter(Array.isArray(members) ? members : [], scope);

  const existing = await fetchAll((from, to) => sb.from(T.members).select('id, member_code').eq('gym_id', gid).range(from, to));

  // Upsert-only: never delete members missing from a partial browser upload (prevents mass data loss).

  const memberRows = incoming
    .filter((m) => m?.memberId)
    .map((m) => appMemberToRow(m, gid));

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

  for (const m of incoming) {
    const memberPk = codeToId.get(String(m.memberId));
    if (!memberPk) continue;
    const { payRows, msgRows, attRows, injuryRows } = buildMemberChildRows(m, gid, memberPk);
    await syncMemberChildRows(sb, T.member_payment_history, {
      gymId: gid,
      memberId: memberPk,
      externalIdColumn: 'external_payment_id',
      rows: payRows,
      onConflict: 'gym_id,member_id,external_payment_id',
    });
    await syncMemberChildRows(sb, T.member_message_history, {
      gymId: gid,
      memberId: memberPk,
      externalIdColumn: 'external_event_id',
      rows: msgRows,
      onConflict: 'gym_id,member_id,external_event_id',
    });
    await syncMemberChildRows(sb, T.member_attachments, {
      gymId: gid,
      memberId: memberPk,
      externalIdColumn: null,
      rows: attRows,
    });
    await syncMemberChildRows(sb, T.member_injury_notes, {
      gymId: gid,
      memberId: memberPk,
      externalIdColumn: 'external_note_id',
      rows: injuryRows,
      onConflict: 'gym_id,member_id,external_note_id',
    });
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
  const accessByStaff = new Map((accRes.data || []).map((r) => [r.staff_user_id, r.access_json || {}]));

  return staffRows.map((row) => staffRowToApp(
    row,
    sectionsByStaff.get(row.id) || [],
    accessByStaff.get(row.id) || {},
  ));
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

  let existingQuery = sb.from(T.staff_users).select('id, staff_login_id, password_hash, photo_url').eq('gym_id', gid);
  if (scope) existingQuery = existingQuery.eq('sandbox_id', scope.sandboxId);
  const existing = await fetchAll((from, to) => existingQuery.range(from, to));

  // Upsert-only: do not delete staff missing from a partial browser list (prevents losing accounts like Deep).

  for (const u of incoming) {
    if (!u?.id) continue;
    const row = appStaffToRow(u, gid);
    if (scope) row.sandbox_id = scope.sandboxId;
    if (!row.gym_code_id && defaultGymCodeId) row.gym_code_id = defaultGymCodeId;

    const found = (existing || []).find((r) => String(r.staff_login_id) === String(u.id));
    if (found && !String(row.photo_url || '').trim() && String(found.photo_url || '').trim()) {
      row.photo_url = found.photo_url;
    }
    let staffPk;
    if (found) {
      const { error } = await sb.from(T.staff_users).update(row).eq('id', found.id);
      if (error) throw new Error(`staff update ${u.id}: ${error.message}`);
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

    await sb.from(T.staff_user_sections).delete().eq('staff_user_id', staffPk);
    await sb.from(T.staff_user_access).delete().eq('staff_user_id', staffPk);

    const isOwnerLogin = String(u.id || '').trim().toLowerCase() === 'owner';
    const sections = isOwnerLogin ? [...ALL_SECTIONS] : (Array.isArray(u.sections) ? u.sections : []);
    if (sections.length) {
      const { error } = await sb.from(T.staff_user_sections).insert(
        sections.map((name) => ({ staff_user_id: staffPk, section_name: String(name) })),
      );
      if (error) throw error;
    }

    const { error: accErr } = await sb.from(T.staff_user_access).insert({
      staff_user_id: staffPk,
      access_json: u.access && typeof u.access === 'object' ? u.access : {},
    });
    if (accErr) throw accErr;
    invalidateStaffAccessCache(u.id);
  }
  notifyCollectionChange('users');
}

async function readSettings(scope) {
  if (scope) {
    return readSettingsSandbox(scope.sandboxId);
  }
  const sb = getSupabase();
  const gid = gymId();

  const [
    lookups,
    templates,
    configRow,
    staffDir,
    roles,
    leaveRows,
    attendanceRows,
    ptRows,
  ] = await Promise.all([
    fetchAll((from, to) => sb.from(T.settings_lookup_values).select('*').eq('gym_id', gid).order('sort_order').range(from, to)),
    fetchAll((from, to) => sb.from(T.settings_templates).select('*').eq('gym_id', gid).range(from, to)),
    sb.from(T.settings_app_config).select('*').eq('gym_id', gid).maybeSingle(),
    fetchAll((from, to) => sb.from(T.settings_staff_directory).select('*').eq('gym_id', gid).range(from, to)),
    fetchAll((from, to) => sb.from(T.staff_role_templates).select('*').eq('gym_id', gid).order('sort_order').range(from, to)),
    fetchAll((from, to) => sb.from(T.leave_requests).select('*').eq('gym_id', gid).range(from, to)),
    fetchAll((from, to) => sb.from(T.staff_attendance_records).select('*').eq('gym_id', gid).range(from, to)),
    fetchAll((from, to) => sb.from(T.pt_client_profiles).select('*').eq('gym_id', gid).range(from, to)),
  ]);

  const settings = buildSettingsObject({
    lookups,
    templates,
    configRow: configRow.data,
    staffDir,
    roles,
    leaveRows,
    attendanceRows,
  });
  await enrichPtProfiles(settings);
  return settings;
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

  for (const t of templates || []) {
    if (t.channel === 'whatsapp') settings.smsTemplates[t.template_key] = t.body;
  }

  if (configRow) {
    settings.fineSmsEnabled = configRow.fine_sms_enabled !== false;
    settings.fineSmsGraceDays = Number(configRow.fine_sms_grace_days || 0);
    settings.fineSmsImmediateRoles = configRow.fine_sms_immediate_roles_json || [];
    settings.financeUseEstimatedExpense = configRow.finance_use_estimated_expense !== false;
    const cfg = configRow.config_json && typeof configRow.config_json === 'object' ? configRow.config_json : {};
    Object.assign(settings, cfg);
    for (const [key] of LOOKUP_CATEGORIES) {
      if (Array.isArray(settings[key])) {
        settings[key] = [...new Set(settings[key].map((v) => String(v || '').trim()).filter(Boolean))];
      }
    }
  }

  settings.staff = (staffDir || []).map((s) => ({
    id: s.staff_code,
    name: s.display_name,
    email: s.email,
    avatar: s.avatar_url,
  }));

  settings.roleTemplates = (roles || []).map((r) => ({
    id: String(r.id),
    title: r.title,
    subtitle: r.subtitle,
    sections: Array.isArray(r.sections_json) ? r.sections_json : [],
    color: r.color_class,
  }));

  settings.leaveRequests = (leaveRows || []).map((r) => ({
    id: r.external_request_id,
    userId: r.staff_login_id,
    type: r.leave_type,
    startDate: r.start_date,
    endDate: r.end_date,
    reason: r.reason,
    status: r.status,
    approvedBy: r.approved_by,
    createdAt: r.created_at,
  }));

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
  const [ptRows, members] = await Promise.all([
    fetchAll((from, to) => sb.from(T.pt_client_profiles).select('*').eq('gym_id', gid).range(from, to)),
    fetchAll((from, to) => sb.from(T.members).select('id, member_code').eq('gym_id', gid).range(from, to)),
  ]);
  const idToCode = new Map((members || []).map((m) => [m.id, m.member_code]));
  const profiles = {};
  for (const p of ptRows || []) {
    const code = idToCode.get(p.member_id);
    if (!code) continue;
    profiles[code] = p.plan_json && typeof p.plan_json === 'object' ? p.plan_json : {};
  }
  settings.ptClientProfiles = profiles;
}

async function readSettingsSandbox(sandboxId) {
  return {};
}

async function writeSettings(settings, scope) {
  if (scope) return;
  const sb = getSupabase();
  const gid = gymId();
  const s = settings && typeof settings === 'object' ? settings : {};

  await sb.from(T.settings_lookup_values).delete().eq('gym_id', gid);
  const lookupRows = [];
  let sort = 0;
  for (const [key, category] of LOOKUP_CATEGORIES) {
    const values = Array.isArray(s[key]) ? s[key] : [];
    values.forEach((value, idx) => {
      lookupRows.push({
        gym_id: gid,
        category,
        value: String(value),
        sort_order: sort + idx,
        is_active: true,
      });
    });
    sort += values.length;
  }
  for (const part of chunk(lookupRows, 80)) {
    if (part.length) await sb.from(T.settings_lookup_values).insert(part);
  }

  await sb.from(T.settings_templates).delete().eq('gym_id', gid);
  const sms = s.smsTemplates && typeof s.smsTemplates === 'object' ? s.smsTemplates : {};
  const templateRows = Object.entries(sms).map(([template_key, body]) => ({
    gym_id: gid,
    template_key,
    channel: 'whatsapp',
    body: String(body || ''),
    updated_at: new Date().toISOString(),
  }));
  for (const part of chunk(templateRows, 80)) {
    if (part.length) await sb.from(T.settings_templates).insert(part);
  }

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

  await sb.from(T.staff_role_templates).delete().eq('gym_id', gid);
  const roles = Array.isArray(s.roleTemplates) ? s.roleTemplates : [];
  for (let idx = 0; idx < roles.length; idx += 1) {
    const role = roles[idx];
    await sb.from(T.staff_role_templates).insert({
      gym_id: gid,
      title: role.title || 'Role',
      subtitle: role.subtitle || null,
      sections_json: Array.isArray(role.sections) ? role.sections : [],
      color_class: role.color || null,
      sort_order: idx,
      created_at: new Date().toISOString(),
    });
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

  await sb.from(T.staff_attendance_records).delete().eq('gym_id', gid);
  const attendanceRows = (Array.isArray(s.staffAttendance) ? s.staffAttendance : []).map((r) => ({
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
  }));
  for (const part of chunk(attendanceRows, 80)) {
    if (part.length) await sb.from(T.staff_attendance_records).insert(part);
  }

  await writePtProfiles(s, gid);
  notifyCollectionChange('settings');
}

async function writePtProfiles(settings, gid) {
  const sb = getSupabase();
  const profiles = settings.ptClientProfiles && typeof settings.ptClientProfiles === 'object'
    ? settings.ptClientProfiles
    : {};

  const members = await fetchAll((from, to) => sb.from(T.members).select('id, member_code').eq('gym_id', gid).range(from, to));
  const codeToId = new Map((members || []).map((m) => [String(m.member_code), m.id]));

  await sb.from(T.pt_client_profiles).delete().eq('gym_id', gid);
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
    if (part.length) await sb.from(T.pt_client_profiles).insert(part);
  }
}

async function readVisitors(scope, branchScope = null) {
  const sb = getSupabase();
  const gid = gymId();
  const rows = await fetchAll((from, to) => {
    let q = sb.from(T.visitors).select('*').eq('gym_id', gid);
    if (branchScope && branchScope.gymCodeId) {
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
  const rows = incoming
    .filter((v) => v?.id)
    .map((v) => appVisitorToRow(v, gid));
  await syncGymRowsByExternalId(sb, T.visitors, {
    gymId: gid,
    externalIdColumn: 'external_visitor_id',
    rows,
    onConflict: 'gym_id,external_visitor_id',
  });
  notifyCollectionChange('visitors');
}

async function readFinance(scope) {
  const sb = getSupabase();
  const gid = gymId();
  const rows = await fetchAll((from, to) => sb.from(T.finance_transactions).select('*').eq('gym_id', gid).range(from, to));
  return sandboxFilter((rows || []).map(financeRowToApp), scope);
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

async function auditLogsHasGymColumn(sb) {
  if (auditLogsGymScoped !== undefined) return auditLogsGymScoped;
  const { error } = await sb.from(T.audit_logs).select('gym_id').limit(0);
  auditLogsGymScoped = !(error && String(error.message || '').includes('gym_id'));
  return auditLogsGymScoped;
}

async function readLogs(scope) {
  const sb = getSupabase();
  const gid = gymId();
  const gymScoped = await auditLogsHasGymColumn(sb);
  const rows = await fetchAll((from, to) => {
    let q = sb.from(T.audit_logs).select('*').order('logged_at', { ascending: false });
    if (gymScoped) q = q.eq('gym_id', gid);
    return q.range(from, to);
  });
  return sandboxFilter((rows || []).map(logRowToApp), scope);
}

async function writeLogs(logs, scope) {
  const sb = getSupabase();
  const gid = gymId();
  const incoming = sandboxFilter(Array.isArray(logs) ? logs : [], scope);
  const gymScoped = await auditLogsHasGymColumn(sb);
  if (!incoming.length) {
    if (gymScoped) await sb.from(T.audit_logs).delete().eq('gym_id', gid);
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

export async function readCollection(key, fallback = [], scope = null, branchScope = null) {
  switch (key) {
    case KEY_MEMBERS:
      return readMembers(scope, branchScope);
    case KEY_USERS:
      return readUsers(scope);
    case KEY_VISITORS:
      return readVisitors(scope, branchScope);
    case KEY_LOGS:
      return readLogs(scope);
    case KEY_FINANCE:
      return readFinance(scope);
    case KEY_SMS:
      return readSmsEvents(scope);
    default:
      return fallback;
  }
}

export { updateMemberFields };

export async function writeCollection(key, value, scope = null) {
  switch (key) {
    case KEY_MEMBERS:
      return writeMembers(value, scope);
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

export async function readSettingsValue(scope = null) {
  const settings = await readSettings(scope);
  await enrichPtProfiles(settings);
  return settings;
}

export async function writeSettingsValue(value, scope = null) {
  return writeSettings(value, scope);
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

/**
 * Lightweight, single-row audit log insert. The legacy writeLogs path
 * round-trips the entire audit_logs collection through syncGymRowsByExternalId
 * — that's correct but ruinous when the only goal is "append one row".
 * This helper does exactly that and nothing more.
 */
export async function insertAuditLogRow(_scope, entry) {
  const sb = getSupabase();
  const gid = gymId();
  if (!entry || typeof entry !== 'object') return;
  const row = appLogToRow(entry, gid);
  try {
    const gymScoped = await auditLogsHasGymColumn(sb);
    if (!gymScoped) delete row.gym_id;
    const { error } = await sb.from(T.audit_logs).insert(row);
    if (error) {
      // Most likely a unique-id collision (we generate uuids so this is
      // vanishingly unlikely). Don't throw — audit-log failures must never
      // roll back the primary mutation.
      console.error('[apg] insertAuditLogRow failed', error.message || error);
      return;
    }
    notifyCollectionChange('logs');
  } catch (err) {
    console.error('[apg] insertAuditLogRow exception', err?.message || err);
  }
}

/** Returns the gym's WhatsApp templates as { [key]: body }. */
export async function getWhatsappTemplates(_scope) {
  const sb = getSupabase();
  const gid = gymId();
  const { data, error } = await sb
    .from(T.settings_templates)
    .select('template_key, body, updated_at')
    .eq('gym_id', gid)
    .eq('channel', 'whatsapp');
  if (error) throw error;
  const templates = {};
  let latestUpdated = null;
  for (const row of data || []) {
    const key = String(row.template_key || '').trim();
    if (!key) continue;
    templates[key] = String(row.body || '');
    if (!latestUpdated || (row.updated_at && row.updated_at > latestUpdated)) {
      latestUpdated = row.updated_at;
    }
  }
  return { templates, updatedAt: latestUpdated };
}

/**
 * Surgical single-template upsert. Mutates exactly one row in
 * settings_templates (gym_id, template_key, channel='whatsapp'), keeping
 * every other template intact. Owner-gated by the caller.
 */
export async function upsertWhatsappTemplate(_scope, { key, body }) {
  const sb = getSupabase();
  const gid = gymId();
  const safeKey = String(key || '').trim();
  if (!/^[a-z][a-zA-Z0-9_-]{0,63}$/.test(safeKey)) {
    throw new Error('template key must match /^[a-z][a-zA-Z0-9_-]{0,63}$/');
  }
  const safeBody = String(body == null ? '' : body);
  if (safeBody.length > 8000) {
    throw new Error('template body exceeds 8000 chars');
  }
  const nowIso = new Date().toISOString();
  // Try upsert on the natural key (gym_id, template_key) first; fall back to
  // delete-then-insert if the unique index isn't there yet.
  const upsertRow = {
    gym_id: gid,
    template_key: safeKey,
    channel: 'whatsapp',
    body: safeBody,
    updated_at: nowIso,
  };
  const { error: upsertErr } = await sb
    .from(T.settings_templates)
    .upsert(upsertRow, { onConflict: 'gym_id,template_key' });
  if (upsertErr) {
    await sb
      .from(T.settings_templates)
      .delete()
      .eq('gym_id', gid)
      .eq('template_key', safeKey)
      .eq('channel', 'whatsapp');
    const { error: insErr } = await sb.from(T.settings_templates).insert(upsertRow);
    if (insErr) throw new Error(`settings_templates upsert failed: ${insErr.message}`);
  }
  notifyCollectionChange('settings');
  return { key: safeKey, body: safeBody, updatedAt: nowIso };
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
  const wanted = new Set(
    (Array.isArray(loginIds) ? loginIds : [])
      .map((x) => String(x || '').trim())
      .filter(Boolean),
  );
  if (!wanted.size) return { deleted: [], skipped: [] };

  // Resolve PKs for the requested login ids inside this gym only.
  const { data: rows, error: lookupErr } = await sb
    .from(T.staff_users)
    .select('id, staff_login_id')
    .eq('gym_id', gid)
    .in('staff_login_id', Array.from(wanted));
  if (lookupErr) throw new Error(`staff lookup failed: ${lookupErr.message}`);

  const present = (rows || []).filter((r) => r && r.id && r.staff_login_id);
  if (!present.length) return { deleted: [], skipped: Array.from(wanted) };

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

  const skipped = Array.from(wanted).filter((id) => !removedLogins.includes(id));
  return { deleted: removedLogins, skipped };
}

export async function ping() {
  const sb = getSupabase();
  const { error } = await sb.from(T.gyms).select('id').eq('id', gymId()).maybeSingle();
  if (error) throw error;
  return true;
}
