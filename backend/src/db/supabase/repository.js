import crypto from 'node:crypto';
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

async function readMembers(scope) {
  const sb = getSupabase();
  const gid = gymId();
  const memberRows = await fetchAll((from, to) => sb.from(T.members).select('*').eq('gym_id', gid).range(from, to));
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

function buildMemberChildRows(m, gid, memberPk) {
  const payRows = [];
  const msgRows = [];
  const attRows = [];
  const injuryRows = [];

  const payments = Array.isArray(m.paymentHistory) ? m.paymentHistory : [];
  for (const p of payments) {
    payRows.push({
      gym_id: gid,
      member_id: memberPk,
      external_payment_id: p.id ? String(p.id) : emptyText(p.id),
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
      external_event_id: ev.id ? String(ev.id) : emptyText(ev.id),
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
  const codes = new Set(incoming.map((m) => String(m.memberId || '').trim()).filter(Boolean));

  const existing = await fetchAll((from, to) => sb.from(T.members).select('id, member_code').eq('gym_id', gid).range(from, to));

  const removeIds = (existing || [])
    .filter((row) => !codes.has(String(row.member_code)))
    .map((row) => row.id);
  await deleteMemberChildren(sb, removeIds);
  for (const idChunk of chunk(removeIds, 100)) {
    const { error } = await sb.from(T.members).delete().in('id', idChunk);
    if (error) throw error;
  }

  const memberRows = incoming
    .filter((m) => m?.memberId)
    .map((m) => appMemberToRow(m, gid));

  const useBulkUpsert = await membersBulkUpsertReady();
  if (useBulkUpsert) {
    await bulkUpsertMemberRows(memberRows);
  } else {
    let codeToId = new Map((existing || []).map((r) => [String(r.member_code), r.id]));
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

  const touchIds = incoming
    .map((m) => codeToId.get(String(m.memberId)))
    .filter(Boolean);
  await deleteMemberChildren(sb, touchIds);

  const allPay = [];
  const allMsg = [];
  const allAtt = [];
  const allInjury = [];
  for (const m of incoming) {
    const memberPk = codeToId.get(String(m.memberId));
    if (!memberPk) continue;
    const { payRows, msgRows, attRows, injuryRows } = buildMemberChildRows(m, gid, memberPk);
    allPay.push(...payRows);
    allMsg.push(...msgRows);
    allAtt.push(...attRows);
    allInjury.push(...injuryRows);
  }

  for (const part of chunk(allPay, 80)) {
    if (part.length) {
      const { error } = await sb.from(T.member_payment_history).insert(part);
      if (error) throw error;
    }
  }
  for (const part of chunk(allMsg, 80)) {
    if (part.length) {
      const { error } = await sb.from(T.member_message_history).insert(part);
      if (error) throw error;
    }
  }
  for (const part of chunk(allAtt, 80)) {
    if (part.length) {
      const { error } = await sb.from(T.member_attachments).insert(part);
      if (error) throw error;
    }
  }
  for (const part of chunk(allInjury, 80)) {
    if (part.length) {
      const { error } = await sb.from(T.member_injury_notes).insert(part);
      if (error) throw error;
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
  const accessByStaff = new Map((accRes.data || []).map((r) => [r.staff_user_id, r.access_json || {}]));

  return staffRows.map((row) => staffRowToApp(
    row,
    sectionsByStaff.get(row.id) || [],
    accessByStaff.get(row.id) || {},
  ));
}

async function writeUsers(users, scope) {
  const sb = getSupabase();
  const gid = gymId();
  const incoming = sandboxFilter(Array.isArray(users) ? users : [], scope);
  const loginIds = new Set(incoming.map((u) => String(u.id || '').trim()).filter(Boolean));

  let existingQuery = sb.from(T.staff_users).select('id, staff_login_id').eq('gym_id', gid);
  if (scope) existingQuery = existingQuery.eq('sandbox_id', scope.sandboxId);
  const existing = await fetchAll((from, to) => existingQuery.range(from, to));

  for (const row of existing || []) {
    if (!loginIds.has(String(row.staff_login_id))) {
      await sb.from(T.staff_user_sections).delete().eq('staff_user_id', row.id);
      await sb.from(T.staff_user_access).delete().eq('staff_user_id', row.id);
      await sb.from(T.staff_users).delete().eq('id', row.id);
    }
  }

  for (const u of incoming) {
    if (!u?.id) continue;
    const row = appStaffToRow(u, gid);
    if (scope) row.sandbox_id = scope.sandboxId;

    const found = (existing || []).find((r) => String(r.staff_login_id) === String(u.id));
    let staffPk;
    if (found) {
      const { error } = await sb.from(T.staff_users).update(row).eq('id', found.id);
      if (error) throw new Error(`staff update ${u.id}: ${error.message}`);
      staffPk = found.id;
    } else {
      const { data, error } = await sb.from(T.staff_users).insert(row).select('id').single();
      if (error) throw new Error(`staff insert ${u.id}: ${error.message}`);
      staffPk = data.id;
    }

    await sb.from(T.staff_user_sections).delete().eq('staff_user_id', staffPk);
    await sb.from(T.staff_user_access).delete().eq('staff_user_id', staffPk);

    const sections = Array.isArray(u.sections) ? u.sections : [];
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
    settings[key] = (lookups || [])
      .filter((r) => r.category === category && r.is_active !== false)
      .map((r) => r.value);
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

async function readVisitors(scope) {
  const sb = getSupabase();
  const gid = gymId();
  const rows = await fetchAll((from, to) => sb.from(T.visitors).select('*').eq('gym_id', gid).range(from, to));
  return sandboxFilter((rows || []).map(visitorRowToApp), scope);
}

async function writeVisitors(visitors, scope) {
  const sb = getSupabase();
  const gid = gymId();
  const incoming = sandboxFilter(Array.isArray(visitors) ? visitors : [], scope);
  const ids = new Set(incoming.map((v) => String(v.id || '').trim()).filter(Boolean));

  const existing = await fetchAll((from, to) => sb.from(T.visitors).select('external_visitor_id').eq('gym_id', gid).range(from, to));
  for (const row of existing || []) {
    if (!ids.has(String(row.external_visitor_id))) {
      await sb.from(T.visitors).delete().eq('gym_id', gid).eq('external_visitor_id', row.external_visitor_id);
    }
  }

  for (const v of incoming) {
    const row = appVisitorToRow(v, gid);
    await sb.from(T.visitors).delete().eq('gym_id', gid).eq('external_visitor_id', row.external_visitor_id);
    const { error } = await sb.from(T.visitors).insert(row);
    if (error) throw new Error(`visitors ${v.id}: ${error.message}`);
  }
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

  await sb.from(T.finance_transactions).delete().eq('gym_id', gid);
  const rows = incoming.map((t) => appFinanceToRow(t, gid, t.memberId ? codeToId.get(String(t.memberId)) || null : null));
  for (const part of chunk(rows, 80)) {
    if (part.length) {
      const { error } = await sb.from(T.finance_transactions).insert(part);
      if (error) throw error;
    }
  }
  notifyCollectionChange('finance');
}

async function readLogs(scope) {
  const sb = getSupabase();
  const rows = await fetchAll((from, to) => sb.from(T.audit_logs).select('*').order('logged_at', { ascending: false }).range(from, to));
  return sandboxFilter((rows || []).map(logRowToApp), scope);
}

async function writeLogs(logs, scope) {
  const sb = getSupabase();
  const incoming = sandboxFilter(Array.isArray(logs) ? logs : [], scope);
  await sb.from(T.audit_logs).delete().gte('id', 0);
  const rows = incoming.map((l) => appLogToRow(l));
  for (const part of chunk(rows, 80)) {
    if (part.length) {
      const { error } = await sb.from(T.audit_logs).insert(part);
      if (error) throw error;
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
  await sb.from(T.sms_status_events).delete().eq('gym_id', gid);
  const rows = incoming.map((e) => appSmsToRow(e, gid));
  for (const part of chunk(rows, 80)) {
    if (part.length) {
      const { error } = await sb.from(T.sms_status_events).insert(part);
      if (error) throw error;
    }
  }
  notifyCollectionChange('smsEvents');
}

export async function readCollection(key, fallback = [], scope = null) {
  switch (key) {
    case KEY_MEMBERS:
      return readMembers(scope);
    case KEY_USERS:
      return readUsers(scope);
    case KEY_VISITORS:
      return readVisitors(scope);
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

export async function ping() {
  const sb = getSupabase();
  const { error } = await sb.from(T.gyms).select('id').eq('id', gymId()).maybeSingle();
  if (error) throw error;
  return true;
}
