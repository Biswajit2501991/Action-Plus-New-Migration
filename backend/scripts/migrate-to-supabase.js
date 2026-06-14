/**
 * One-time import: SQLite app_kv (app.db) → Supabase Postgres tables.
 *
 * Usage (from backend/):
 *   npm run db:migrate-supabase:dry   # counts only
 *   npm run db:migrate-supabase       # import
 *   npm run db:migrate-supabase -- --fresh   # delete gym-scoped rows first
 *
 * Requires backend/.env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APG_GYM_ID
 */

import Database from 'better-sqlite3';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { initMembersTableName, T } from '../src/db/tables.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const FRESH = args.has('--fresh');
const RESUME = args.has('--resume');

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const GYM_ID = String(process.env.APG_GYM_ID || '').trim();
const DB_PATH = path.resolve(
  __dirname,
  '..',
  process.env.DATABASE_PATH || './data/app.db',
);

const LOOKUP_CATEGORIES = [
  ['plans', 'plans'],
  ['statuses', 'statuses'],
  ['paymentMethods', 'paymentMethods'],
  ['holdDurations', 'holdDurations'],
  ['genders', 'genders'],
  ['expenseCategories', 'expenseCategories'],
  ['exerciseTypes', 'exerciseTypes'],
];

function fail(msg) {
  console.error(`\n[migrate] ERROR: ${msg}`);
  process.exit(1);
}

function readKv(db, key, fallback) {
  const row = db.prepare('select value_json from app_kv where key = ?').get(key);
  if (!row?.value_json) return fallback;
  try {
    return JSON.parse(row.value_json);
  } catch {
    return fallback;
  }
}

function toDate(value, { required = false } = {}) {
  const s = String(value || '').trim();
  if (!s) return required ? '1970-01-01' : null;
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function toTs(value) {
  const s = String(value || '').trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function chunk(list, size = 80) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function insertBatches(supabase, table, rows, { select = 'id' } = {}) {
  if (!rows.length) return [];
  const inserted = [];
  for (const part of chunk(rows, 80)) {
    const { data, error } = await supabase.from(table).insert(part).select(select);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (data) inserted.push(...data);
  }
  return inserted;
}

async function deleteForGym(supabase, table, gymId) {
  const { error } = await supabase.from(table).delete().eq('gym_id', gymId);
  if (error) throw new Error(`delete ${table}: ${error.message}`);
}

async function clearGymData(supabase, gymId) {
  console.log('[migrate] Clearing existing rows for gym...');
  const tablesWithGymId = [
    T.pt_client_profiles,
    T.member_injury_notes,
    T.member_attachments,
    T.member_message_history,
    T.member_payment_history,
    T.members,
    T.leave_requests,
    T.staff_attendance_records,
    T.finance_transactions,
    T.sms_status_events,
    T.visitors,
    T.settings_lookup_values,
    T.settings_templates,
    T.settings_staff_directory,
    T.staff_role_templates,
    T.settings_app_config,
    T.audit_logs,
  ];
  for (const table of tablesWithGymId) {
    if (DRY_RUN) {
      console.log(`  would delete ${table}`);
      continue;
    }
    await deleteForGym(supabase, table, gymId);
  }
  if (DRY_RUN) {
    console.log('  would delete staff_user_sections / staff_user_access / staff_users');
    return;
  }
  const { data: staffRows, error: staffErr } = await supabase
    .from(T.staff_users)
    .select('id')
    .eq('gym_id', gymId);
  if (staffErr) throw new Error(`staff_users select: ${staffErr.message}`);
  const staffIds = (staffRows || []).map((r) => r.id);
  if (staffIds.length) {
    const { error: secErr } = await supabase.from(T.staff_user_sections).delete().in('staff_user_id', staffIds);
    if (secErr) throw new Error(`delete staff_user_sections: ${secErr.message}`);
    const { error: accErr } = await supabase.from(T.staff_user_access).delete().in('staff_user_id', staffIds);
    if (accErr) throw new Error(`delete staff_user_access: ${accErr.message}`);
  }
  await deleteForGym(supabase, T.staff_users, gymId);
}

async function verifyGym(supabase, gymId) {
  const { data, error } = await supabase.from(T.gyms).select('id, slug, display_name').eq('id', gymId).maybeSingle();
  if (error) throw new Error(`gyms: ${error.message}`);
  if (!data) fail(`Gym ${gymId} not found in public.gyms. Insert gym row first.`);
  return data;
}

function mapStaffUser(u, gymId) {
  return {
    gym_id: gymId,
    staff_login_id: String(u.id || '').trim(),
    full_name: String(u.name || u.id || 'Staff').trim(),
    email: u.email || null,
    password_hash: String(u.password || ''),
    is_blocked: Boolean(u.blocked),
    is_test_profile: Boolean(u.testProfile),
    blocked_reason: u.blockedReason || null,
    blocked_at: toTs(u.blockedAt),
    updated_by: u.updatedBy || null,
    sandbox_id: u.sandboxId || null,
    password_reset_requested_at: toTs(u.passwordResetRequestedAt),
    password_reset_approved_at: toTs(u.passwordResetApprovedAt),
    last_login_at: toTs(u.lastLoginAt),
    created_at: toTs(u.createdAt) || new Date().toISOString(),
    updated_at: toTs(u.updatedAt) || new Date().toISOString(),
  };
}

function emptyText(value) {
  const s = String(value ?? '').trim();
  return s || '';
}

function mapMember(m, gymId) {
  const updatedAt = toTs(m.updatedAt) || new Date().toISOString();
  const createdAt = toTs(m.createdAt) || updatedAt;
  return {
    gym_id: gymId,
    member_code: String(m.memberId || '').trim(),
    form_no: Number.isFinite(Number(m.formNo)) ? Number(m.formNo) : null,
    full_name: emptyText(m.name) || 'Unknown',
    email: emptyText(m.email),
    mobile: emptyText(m.mobile),
    dob: toDate(m.dob, { required: true }),
    gender: emptyText(m.gender),
    address: emptyText(m.address),
    assigned_staff: emptyText(m.staff),
    plan_name: emptyText(m.plan),
    status: String(m.status || 'Active'),
    hold_duration: emptyText(m.holdDuration),
    amount: Number(m.amount || 0),
    payment_method: emptyText(m.paymentMethod),
    joining_date: toDate(m.joiningDate),
    billing_date: toDate(m.billingDate),
    billing_date_updated_at: toTs(m.billingDateUpdatedAt) || updatedAt,
    next_payment_date: toDate(m.nextPaymentDate),
    payment_by: toDate(m.paymentBy),
    pay_month: emptyText(m.payMonth),
    remark: emptyText(m.remark),
    photo_url: m.photo || null,
    medical_skipped: Boolean(m.medicalSkipped),
    medical_answers_json: m.medicalAnswers || null,
    ack_accepted: Boolean(m.ackAccepted),
    ack_signature: emptyText(m.ackSignature),
    ack_date: toDate(m.ackDate),
    parent_guardian_name: emptyText(m.parentGuardianName),
    parent_guardian_dob: toDate(m.parentGuardianDob),
    parent_guardian_signature: emptyText(m.parentGuardianSignature),
    family_group_id: m.familyGroupId || null,
    family_primary_member_id: m.familyPrimaryMemberId || null,
    last_sms_sent_json: m.lastSmsSent || null,
    updated_by: emptyText(m.updatedBy),
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

async function migrateStaff(supabase, users, gymId) {
  console.log(`[migrate] Staff users: ${users.length}`);
  if (DRY_RUN || !users.length) return new Map();

  const loginToId = new Map();
  for (const u of users) {
    if (!u?.id) continue;
    const row = mapStaffUser(u, gymId);
    const { data, error } = await supabase
      .from(T.staff_users)
      .insert(row)
      .select('id, staff_login_id')
      .single();
    if (error) throw new Error(`staff_users(${u.id}): ${error.message}`);
    loginToId.set(String(u.id), data.id);

    const sections = Array.isArray(u.sections) ? u.sections : [];
    if (sections.length) {
      const sectionRows = sections.map((name) => ({
        staff_user_id: data.id,
        section_name: String(name),
      }));
      const { error: secErr } = await supabase.from(T.staff_user_sections).insert(sectionRows);
      if (secErr) throw new Error(`staff_user_sections(${u.id}): ${secErr.message}`);
    }

    const { error: accErr } = await supabase.from(T.staff_user_access).insert({
      staff_user_id: data.id,
      access_json: u.access && typeof u.access === 'object' ? u.access : {},
    });
    if (accErr) throw new Error(`staff_user_access(${u.id}): ${accErr.message}`);
  }
  return loginToId;
}

async function migrateSettings(supabase, settings, gymId) {
  console.log('[migrate] Settings...');
  if (DRY_RUN) return;

  const lookupRows = [];
  let sort = 0;
  for (const [key, category] of LOOKUP_CATEGORIES) {
    const values = Array.isArray(settings[key]) ? settings[key] : [];
    values.forEach((value, idx) => {
      lookupRows.push({
        gym_id: gymId,
        category,
        value: String(value),
        sort_order: sort + idx,
        is_active: true,
      });
    });
    sort += values.length;
  }
  await insertBatches(supabase, T.settings_lookup_values, lookupRows);

  const sms = settings.smsTemplates && typeof settings.smsTemplates === 'object' ? settings.smsTemplates : {};
  const templateRows = Object.entries(sms).map(([template_key, body]) => ({
    gym_id: gymId,
    template_key,
    channel: 'whatsapp',
    body: String(body || ''),
    updated_at: new Date().toISOString(),
  }));
  await insertBatches(supabase, T.settings_templates, templateRows);

  const staffDir = Array.isArray(settings.staff) ? settings.staff : [];
  await insertBatches(
    supabase,
    T.settings_staff_directory,
    staffDir.map((s) => ({
      gym_id: gymId,
      staff_code: String(s.id || s.name || '').trim(),
      display_name: String(s.name || s.id || '').trim(),
      email: s.email || null,
      avatar_url: s.avatar || null,
    })),
  );

  const roles = Array.isArray(settings.roleTemplates) ? settings.roleTemplates : [];
  for (let idx = 0; idx < roles.length; idx += 1) {
    const role = roles[idx];
    const { error } = await supabase.from(T.staff_role_templates).insert({
      gym_id: gymId,
      title: role.title || 'Role',
      subtitle: role.subtitle || null,
      sections_json: Array.isArray(role.sections) ? role.sections : [],
      color_class: role.color || null,
      sort_order: idx,
      created_at: new Date().toISOString(),
    });
    if (error) throw new Error(`staff_role_templates: ${error.message}`);
  }

  const configJson = {
    medicalQuestionnaireTemplate: settings.medicalQuestionnaireTemplate || null,
    acknowledgementTemplate: settings.acknowledgementTemplate || null,
    acknowledgementUnder18Template: settings.acknowledgementUnder18Template || null,
    gmailWelcomeTemplate: settings.gmailWelcomeTemplate || null,
    smsTemplatePresetVersion: settings.smsTemplatePresetVersion || null,
    customTemplatesEnabled: settings.customTemplatesEnabled === true,
  };

  const { error: cfgErr } = await supabase.from(T.settings_app_config).insert({
    gym_id: gymId,
    fine_sms_enabled: settings.fineSmsEnabled !== false,
    fine_sms_grace_days: Number(settings.fineSmsGraceDays || 0),
    fine_sms_immediate_roles_json: Array.isArray(settings.fineSmsImmediateRoles)
      ? settings.fineSmsImmediateRoles
      : [],
    finance_use_estimated_expense: settings.financeUseEstimatedExpense !== false,
    config_json: configJson,
    updated_at: new Date().toISOString(),
  });
  if (cfgErr) throw new Error(`settings_app_config: ${cfgErr.message}`);

  const leaveRows = (Array.isArray(settings.leaveRequests) ? settings.leaveRequests : []).map((r) => ({
    gym_id: gymId,
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
  await insertBatches(supabase, T.leave_requests, leaveRows);

  const attendanceRows = (Array.isArray(settings.staffAttendance) ? settings.staffAttendance : []).map((r) => ({
    gym_id: gymId,
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
  await insertBatches(supabase, T.staff_attendance_records, attendanceRows);

  const ptProfiles = settings.ptClientProfiles && typeof settings.ptClientProfiles === 'object'
    ? settings.ptClientProfiles
    : {};
  console.log(`[migrate] PT profiles in settings object: ${Object.keys(ptProfiles).length} (applied after members)`);
}

async function migrateMembers(supabase, members, gymId) {
  console.log(`[migrate] Members: ${members.length}`);
  if (DRY_RUN) return new Map();

  const codeToId = new Map();
  let done = 0;

  for (const m of members) {
    if (!m?.memberId) continue;
    const row = mapMember(m, gymId);
    const { data, error } = await supabase.from(T.members).insert(row).select('id, member_code').single();
    if (error) throw new Error(`members(${m.memberId}): ${error.message}`);
    codeToId.set(String(m.memberId), data.id);

    const payments = Array.isArray(m.paymentHistory) ? m.paymentHistory : [];
    if (payments.length) {
      const payRows = payments.map((p) => ({
        gym_id: gymId,
        member_id: data.id,
        external_payment_id: p.id ? String(p.id) : emptyText(p.id),
        paid_at: toTs(p.paidAt || p.receivedAt || p.date || p.ts) || new Date().toISOString(),
        amount: Number(p.amount || 0),
        method: emptyText(p.method || p.paymentMethod),
        billing_month: emptyText(p.billingMonth),
        billing_date: toDate(p.billingDate, { required: true }),
        paid_month: emptyText(p.paidMonth || p.billingMonth),
        recorded_by: emptyText(p.recordedBy || p.by),
        source: emptyText(p.source),
        note: emptyText(p.note),
        created_at: toTs(p.createdAt) || new Date().toISOString(),
      }));
      await insertBatches(supabase, T.member_payment_history, payRows);
    }

    const messages = Array.isArray(m.messageHistory) ? m.messageHistory : [];
    if (messages.length) {
      const msgRows = messages.map((ev) => ({
        gym_id: gymId,
        member_id: data.id,
        external_event_id: ev.id ? String(ev.id) : emptyText(ev.id),
        channel: emptyText(ev.channel),
        template_key: emptyText(ev.templateKey),
        status: emptyText(ev.status),
        sent_at: toTs(ev.sentAt || ev.ts) || new Date().toISOString(),
        sent_by: emptyText(ev.sentBy || ev.by || ev.calledBy),
        payload_json: ev,
        created_at: toTs(ev.sentAt || ev.ts) || new Date().toISOString(),
      }));
      await insertBatches(supabase, T.member_message_history, msgRows);
    }

    const attachments = Array.isArray(m.attachments) ? m.attachments : [];
    if (attachments.length) {
      const attRows = attachments.map((a) => ({
        gym_id: gymId,
        member_id: data.id,
        file_name: emptyText(a.name) || 'file',
        mime_type: emptyText(a.mime),
        file_size: Number(a.size || 0) || null,
        storage_path: a.dataUrl ? String(a.dataUrl).slice(0, 500000) : null,
        uploaded_at: toTs(a.uploadedAt) || new Date().toISOString(),
      }));
      await insertBatches(supabase, T.member_attachments, attRows);
    }

    const injuryLog = m.medicalAnswers?.injuryNotesLog;
    if (Array.isArray(injuryLog) && injuryLog.length) {
      const injuryRows = injuryLog.map((n) => ({
        gym_id: gymId,
        member_id: data.id,
        external_note_id: n.id ? String(n.id) : null,
        note_text: emptyText(n.text || n.note) || '-',
        created_by: emptyText(n.by || n.createdBy),
        created_at: toTs(n.createdAt || n.ts) || new Date().toISOString(),
      }));
      await insertBatches(supabase, T.member_injury_notes, injuryRows);
    }

    done += 1;
    if (done % 50 === 0) console.log(`  members ${done}/${members.length}`);
  }
  return codeToId;
}

async function migratePtProfiles(supabase, settings, codeToId, gymId) {
  const ptProfiles = settings.ptClientProfiles && typeof settings.ptClientProfiles === 'object'
    ? settings.ptClientProfiles
    : {};
  const rows = [];
  for (const [memberCode, profile] of Object.entries(ptProfiles)) {
    const memberId = codeToId.get(memberCode);
    if (!memberId) continue;
    rows.push({
      gym_id: gymId,
      member_id: memberId,
      trainer_staff_code: emptyText(profile.trainer || profile.trainerId),
      plan_json: {
        ...(profile && typeof profile === 'object' ? profile : {}),
        dietFiles: profile?.dietFiles || profile?.documents || null,
      },
      updated_at: new Date().toISOString(),
    });
  }
  console.log(`[migrate] PT client profiles: ${rows.length}`);
  if (!DRY_RUN && rows.length) await insertBatches(supabase, T.pt_client_profiles, rows);
}

async function migrateVisitors(supabase, visitors, gymId) {
  console.log(`[migrate] Visitors: ${visitors.length}`);
  if (DRY_RUN || !visitors.length) return;
  const rows = visitors.map((v) => ({
    gym_id: gymId,
    external_visitor_id: String(v.id || crypto.randomUUID()),
    full_name: String(v.fullName || '').trim(),
    email: String(v.email || '').trim(),
    mobile: String(v.mobile || '').trim(),
    dob: toDate(v.dob),
    gender: v.gender || null,
    status: String(v.status || 'New'),
    call_back_required: Boolean(v.callBackRequired),
    tentative_joining_date: toDate(v.tentativeJoiningDate),
    last_called_at: toTs(v.lastCalledAt),
    last_called_by: v.lastCalledBy || null,
    added_at: toTs(v.addedAt),
    created_at: toTs(v.addedAt) || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
  await insertBatches(supabase, T.visitors, rows);
}

async function migrateFinance(supabase, finance, gymId, codeToId) {
  console.log(`[migrate] Finance transactions: ${finance.length}`);
  if (DRY_RUN || !finance.length) return;
  const statusAsNumeric = (raw) => {
    const s = String(raw || '').toLowerCase();
    if (s === 'paid') return 1;
    if (s === 'pending') return 0;
    if (s === 'posted') return 2;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };

  const rows = finance.map((t) => {
    const statusNote = t.status ? `status:${t.status}` : '';
    const note = [statusNote, emptyText(t.note)].filter(Boolean).join(' | ');
    return {
      gym_id: gymId,
      external_tx_id: t.id ? String(t.id) : emptyText(t.id),
      tx_type: t.type === 'expense' ? 'expense' : 'income',
      source: emptyText(t.source) || 'manual',
      member_id: t.memberId ? codeToId.get(String(t.memberId)) || null : null,
      member_code: emptyText(t.memberId),
      member_name: emptyText(t.memberName),
      tx_date: toDate(t.date, { required: true }),
      plan_name: emptyText(t.plan),
      method: emptyText(t.method),
      amount: Number(t.amount || 0),
      status: statusAsNumeric(t.status),
      category: emptyText(t.category),
      note,
      created_at: toTs(t.createdAt) || new Date().toISOString(),
    };
  });
  await insertBatches(supabase, T.finance_transactions, rows);
}

async function migrateLogs(supabase, logs, gymId) {
  console.log(`[migrate] Audit logs: ${logs.length}`);
  if (DRY_RUN || !logs.length) return;
  const rows = logs.map((l) => ({
    gym_id: gymId,
    external_log_id: l.id ? String(l.id) : null,
    actor_name: String(l.actor || 'Unknown'),
    action: String(l.action || ''),
    entity_type: String(l.entityType || ''),
    entity_id: l.entityId ? String(l.entityId) : null,
    before_json: l.before || null,
    after_json: l.after || null,
    logged_at: toTs(l.ts) || new Date().toISOString(),
  }));
  await insertBatches(supabase, T.audit_logs, rows);
}

async function migrateSmsEvents(supabase, events, gymId) {
  console.log(`[migrate] SMS status events: ${events.length}`);
  if (DRY_RUN || !events.length) return;
  const rows = events.map((e) => ({
    gym_id: gymId,
    external_event_id: e.id ? String(e.id) : null,
    member_code: e.memberId || null,
    member_name: e.memberName || null,
    from_status: e.fromStatus || null,
    to_status: e.toStatus || null,
    template_key: e.templateKey || null,
    message: e.message || null,
    wa_url: e.waUrl || null,
    event_at: toTs(e.ts) || new Date().toISOString(),
  }));
  await insertBatches(supabase, T.sms_status_events, rows);
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    fail('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env');
  }
  if (!GYM_ID) fail('Set APG_GYM_ID in backend/.env');
  if (SUPABASE_URL.includes('supabase.com/dashboard')) {
    fail('SUPABASE_URL must be https://<project-ref>.supabase.co (not the dashboard URL)');
  }

  console.log(`[migrate] SQLite: ${DB_PATH}`);
  console.log(`[migrate] Supabase: ${SUPABASE_URL}`);
  console.log(`[migrate] Gym: ${GYM_ID}`);
  console.log(`[migrate] Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}${FRESH ? ' + --fresh' : ''}${RESUME ? ' + --resume' : ''}`);

  const db = Database(DB_PATH, { readonly: true });
  const users = readKv(db, 'apg.users', []);
  const members = readKv(db, 'apg.members', []);
  const visitors = readKv(db, 'apg.visitors', []);
  const settings = readKv(db, 'apg.settings', {});
  const logs = readKv(db, 'apg.logs', []);
  const finance = readKv(db, 'apg.finance', []);
  const smsEvents = readKv(db, 'apg.sms.events', []);

  console.log('\n[migrate] Source counts:');
  console.log(`  users: ${users.length}`);
  console.log(`  members: ${members.length}`);
  console.log(`  visitors: ${visitors.length}`);
  console.log(`  logs: ${logs.length}`);
  console.log(`  finance: ${finance.length}`);
  console.log(`  sms events: ${smsEvents.length}`);

  if (DRY_RUN) {
    console.log('\n[migrate] Dry run complete. Run without --dry-run to import.');
    db.close();
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await initMembersTableName(supabase);
  console.log(`[migrate] Members table: ${T.members}`);

  const gym = await verifyGym(supabase, GYM_ID);
  console.log(`[migrate] Gym OK: ${gym.display_name} (${gym.slug})`);

  if (FRESH) await clearGymData(supabase, GYM_ID);

  let codeToId = new Map();
  if (!RESUME) {
    await migrateStaff(supabase, users, GYM_ID);
    await migrateSettings(supabase, settings, GYM_ID);
    codeToId = await migrateMembers(supabase, members, GYM_ID);
  } else {
    console.log('[migrate] Resume: loading member_code → id map from Supabase...');
    const { data, error } = await supabase.from(T.members).select('id, member_code').eq('gym_id', GYM_ID);
    if (error) throw new Error(`resume members: ${error.message}`);
    for (const row of data || []) codeToId.set(String(row.member_code), row.id);
    console.log(`[migrate] Loaded ${codeToId.size} members`);
  }

  await migratePtProfiles(supabase, settings, codeToId, GYM_ID);
  await migrateVisitors(supabase, visitors, GYM_ID);
  await migrateFinance(supabase, finance, GYM_ID, codeToId);
  await migrateLogs(supabase, logs, GYM_ID);
  await migrateSmsEvents(supabase, smsEvents, GYM_ID);

  db.close();
  console.log('\n[migrate] Import finished successfully.');
  console.log('[migrate] Note: The app still uses local SQLite until the API is wired to Supabase.');
}

main().catch((err) => {
  console.error('\n[migrate] Failed:', err?.message || err);
  process.exit(1);
});
