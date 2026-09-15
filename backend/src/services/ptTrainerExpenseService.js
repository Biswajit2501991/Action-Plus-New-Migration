/**
 * PT trainer expense pending — create on billing-date advance; expense only after trainer Yes.
 * Additive: does not rewrite members.amount or payment history.
 */

import { T } from '../db/tables.js';
import { getSupabase, gymId } from '../db/supabase/client.js';
import { upsertFinanceExpenseRow } from '../db/supabase/repository.js';
import { authIsMasterOwner, resolveAllowedBranchIds } from '../auth/tenant/scopedAuth.js';
  import {
    ptAssignmentTokens,
    ptClientAssignedToViewer,
    resolveStaffCanonical,
  } from './pt/ptTrainerScope.js';

const OPEN_STATUSES = new Set(['pending', 'declined']);
const PT_PLAN_RE = /\bpt\b/i;

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function ymFromDate(raw) {
  const s = String(raw || '').trim();
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function parseYmd(raw) {
  const s = String(raw || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) ? t : null;
}

function isBillingDateForward(prevRaw, nextRaw) {
  const a = parseYmd(prevRaw);
  const b = parseYmd(nextRaw);
  if (a == null || b == null) return false;
  return b > a;
}

function monthLabel(ym) {
  const m = String(ym || '').trim();
  if (!/^\d{4}-\d{2}$/.test(m)) return m || '';
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1, 1));
  return d.toLocaleString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function istDateKey(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

async function loadConfig(sb, gid) {
  const { data } = await sb
    .from('settings_app_config')
    .select('config_json')
    .eq('gym_id', gid)
    .maybeSingle();
  const cfg =
    data?.config_json && typeof data.config_json === 'object' ? data.config_json : {};
  return cfg;
}

function defaultAmountFromConfig(cfg) {
  const n = Number(cfg.ptTrainerExpenseDefaultAmount);
  if (Number.isFinite(n) && n >= 0) return roundMoney(n);
  return 1000;
}

function trainerOverrideAmount(cfg, trainerLoginId) {
  const profiles =
    cfg.staffSalaryProfiles && typeof cfg.staffSalaryProfiles === 'object'
      ? cfg.staffSalaryProfiles
      : {};
  const row = profiles[trainerLoginId] || profiles[String(trainerLoginId || '').toLowerCase()];
  if (!row || typeof row !== 'object') return null;
  const n = Number(row.ptTrainerPayoutAmount ?? row.payoutAmount);
  return Number.isFinite(n) && n >= 0 ? roundMoney(n) : null;
}

function rowToPending(row) {
  if (!row) return null;
  return {
    id: String(row.id || ''),
    memberCode: String(row.member_code || ''),
    memberName: String(row.member_name || ''),
    memberMobile: String(row.member_mobile || ''),
    assignedGymCodeId: row.assigned_gym_code_id ? String(row.assigned_gym_code_id) : null,
    trainerStaffLoginId: String(row.trainer_staff_login_id || ''),
    trainerName: String(row.trainer_name || ''),
    serviceMonth: String(row.service_month || ''),
    monthLabel: monthLabel(row.service_month),
    amountInr: Number(row.amount_inr),
    status: String(row.status || ''),
    paymentMethod: row.payment_method ? String(row.payment_method) : null,
    expenseExternalTxId: row.expense_external_tx_id
      ? String(row.expense_external_tx_id)
      : null,
    createdByStaffLoginId: String(row.created_by_staff_login_id || ''),
    createdByStaffName: String(row.created_by_staff_name || ''),
    declinedAt: row.declined_at || null,
    confirmedAt: row.confirmed_at || null,
    dismissedAt: row.dismissed_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    message: `PT payment pending for Trainer ${row.trainer_name || row.trainer_staff_login_id} – ${row.member_name || row.member_code} (${monthLabel(row.service_month)}). Awaiting trainer confirmation.`,
  };
}

async function resolveTrainerStaff(sb, gid, memberRow, profile) {
  const tokens = ptAssignmentTokens(
    {
      plan: memberRow.plan_name,
      plan_name: memberRow.plan_name,
      staff: memberRow.assigned_staff,
      assigned_staff: memberRow.assigned_staff,
    },
    profile,
  );
  if (!tokens.length) return null;

  const { data: staffRows, error } = await sb
    .from(T.staff_users)
    .select('id, staff_login_id, full_name, is_blocked')
    .eq('gym_id', gid)
    .limit(500);
  if (error) throw error;

  const active = (staffRows || []).filter((r) => !r.is_blocked);
  for (const token of tokens) {
    for (const staff of active) {
      const login = String(staff.staff_login_id || '').trim();
      const name = String(staff.full_name || '').trim();
      if (
        ptClientAssignedToViewer(
          {
            plan: memberRow.plan_name,
            plan_name: memberRow.plan_name,
            staff: memberRow.assigned_staff,
            assigned_staff: memberRow.assigned_staff,
          },
          profile,
          login,
          name,
        )
      ) {
        return {
          loginId: login,
          name: name || login,
        };
      }
    }
  }
  return null;
}

/**
 * After a successful member patch: if billingDate moved forward and feature is on,
 * create (or ignore duplicate) a pending trainer payout row.
 */
export async function maybeCreatePendingOnBillingAdvance({
  memberBefore,
  memberAfter,
  actorAuth,
}) {
  const prev = String(memberBefore?.billing_date || memberBefore?.billingDate || '').trim();
  const next = String(memberAfter?.billingDate || memberAfter?.billing_date || '').trim();
  if (!isBillingDateForward(prev, next)) return null;

  const status = String(memberAfter?.status || memberBefore?.status || '').trim();
  if (status !== 'Active') return null;

  const plan = String(memberAfter?.plan || memberAfter?.plan_name || memberBefore?.plan_name || '');
  if (!PT_PLAN_RE.test(plan)) return null;

  const sb = getSupabase();
  const gid = gymId();
  const cfg = await loadConfig(sb, gid);
  if (cfg.ptTrainerExpenseAutoEnabled !== true) return null;

  const memberCode = String(
    memberAfter?.memberId || memberAfter?.member_code || memberBefore?.member_code || '',
  ).trim();
  if (!memberCode) return null;

  const serviceMonth = ymFromDate(prev) || ymFromDate(next);
  if (!serviceMonth) return null;

  let profile = null;
  try {
    const { data: settingsRow } = await sb
      .from('settings_app_config')
      .select('config_json')
      .eq('gym_id', gid)
      .maybeSingle();
    const profiles = settingsRow?.config_json?.ptClientProfiles;
    if (profiles && typeof profiles === 'object') profile = profiles[memberCode] || null;
  } catch {
    /* ignore */
  }

  const memberRow = {
    plan_name: plan,
    assigned_staff: memberAfter?.staff || memberBefore?.assigned_staff || '',
    full_name: memberAfter?.name || memberAfter?.fullName || memberBefore?.full_name || '',
    mobile: memberAfter?.mobile || memberBefore?.mobile || '',
    assigned_gym_code_id:
      memberAfter?.assignedGymCodeId || memberBefore?.assigned_gym_code_id || null,
    member_code: memberCode,
  };

  const trainer = await resolveTrainerStaff(sb, gid, memberRow, profile);
  if (!trainer?.loginId) return null;

  const amount =
    trainerOverrideAmount(cfg, trainer.loginId) ?? defaultAmountFromConfig(cfg);

  const insertRow = {
    gym_id: gid,
    member_code: memberCode,
    member_name: String(memberRow.full_name || '').slice(0, 160),
    member_mobile: String(memberRow.mobile || '').slice(0, 40),
    assigned_gym_code_id: memberRow.assigned_gym_code_id || null,
    trainer_staff_login_id: trainer.loginId.slice(0, 120),
    trainer_name: String(trainer.name || trainer.loginId).slice(0, 120),
    service_month: serviceMonth,
    amount_inr: amount,
    status: 'pending',
    created_by_staff_login_id: String(actorAuth?.userId || '').slice(0, 120),
    created_by_staff_name: String(actorAuth?.name || actorAuth?.userId || 'Staff').slice(0, 120),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from('pt_trainer_expense_pending')
    .insert(insertRow)
    .select('*')
    .maybeSingle();

  if (error) {
    if (/duplicate|unique/i.test(String(error.message || ''))) return null;
    console.warn('[pt-trainer-expense] create pending failed:', error.message);
    return null;
  }
  return data ? rowToPending(data) : null;
}

export async function listOpenPendingForTrainer(auth) {
  const login = String(auth?.userId || '').trim().toLowerCase();
  if (!login) return [];
  const sb = getSupabase();
  const gid = gymId();
  const { data, error } = await sb
    .from('pt_trainer_expense_pending')
    .select('*')
    .eq('gym_id', gid)
    .ilike('trainer_staff_login_id', login)
    .in('status', ['pending', 'declined'])
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data || []).map(rowToPending);
}

export async function listOpenPendingForOwner(auth) {
  if (!authIsMasterOwner(auth) && !auth?.access?.__owner) {
    const err = new Error('forbidden');
    err.status = 403;
    throw err;
  }
  const sb = getSupabase();
  const gid = gymId();
  let q = sb
    .from('pt_trainer_expense_pending')
    .select('*')
    .eq('gym_id', gid)
    .in('status', ['pending', 'declined'])
    .order('updated_at', { ascending: false })
    .limit(100);

  const active = String(auth?.activeBranchId || auth?.gymCodeId || '').trim();
  if (active) q = q.eq('assigned_gym_code_id', active);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(rowToPending);
}

function staffHasFinanceAccess(auth) {
  const sections = Array.isArray(auth?.sections) ? auth.sections : [];
  if (sections.includes('Finance')) return true;
  const f = auth?.access?.finance;
  if (!f || typeof f !== 'object') return false;
  return Object.values(f).some(Boolean);
}

function staffSectionsSuperset(staffSections, templateSections) {
  const have = new Set((staffSections || []).map((s) => String(s)));
  const need = Array.isArray(templateSections) ? templateSections : [];
  if (!need.length) return false;
  return need.every((s) => have.has(String(s)));
}

/**
 * Non-owner staff eligibility for staff pending toasts.
 */
export function staffMayReceivePtPayoutStaffNotify(auth, pending, cfg, roleTemplates = []) {
  if (cfg?.ptTrainerExpenseNotifyStaffEnabled !== true) return false;
  const login = String(auth?.userId || '').trim().toLowerCase();
  if (!login) return false;
  if (login === String(pending?.trainerStaffLoginId || '').trim().toLowerCase()) return false;

  const roles = Array.isArray(cfg.ptTrainerExpenseNotifyStaffRoles)
    ? cfg.ptTrainerExpenseNotifyStaffRoles.map((r) => String(r || '').trim()).filter(Boolean)
    : [];
  const ids = Array.isArray(cfg.ptTrainerExpenseNotifyStaffIds)
    ? cfg.ptTrainerExpenseNotifyStaffIds.map((r) => String(r || '').trim().toLowerCase()).filter(Boolean)
    : [];
  if (!roles.length && !ids.length) return false;

  if (ids.includes(login)) return true;

  const staffRole = String(auth?.staffRole || '').trim().toLowerCase();
  const sections = Array.isArray(auth?.sections) ? auth.sections : [];

  for (const token of roles) {
    const t = token.toLowerCase();
    if (t === 'branch_owner' || t === 'branch_admin') {
      if (staffRole === 'branch_owner') return true;
      continue;
    }
    if (t === 'finance') {
      if (staffHasFinanceAccess(auth)) return true;
      continue;
    }
    const tpl = (roleTemplates || []).find((r) => {
      const id = String(r?.id || r?.external_template_id || '').toLowerCase();
      const title = String(r?.title || '').toLowerCase().replace(/\s+/g, '');
      return id === t || title === t.replace(/_/g, '');
    });
    if (tpl) {
      const tplSections = Array.isArray(tpl.sections)
        ? tpl.sections
        : Array.isArray(tpl.sections_json)
          ? tpl.sections_json
          : [];
      if (staffSectionsSuperset(sections, tplSections)) return true;
    }
    // Built-in template ids from frontend defaults
    if (t === 'manager' && sections.includes('Finance') && sections.includes('Staff')) {
      return true;
    }
    if (t === 'frontdesk' && sections.includes('Members') && sections.includes('Finance')) {
      return true;
    }
  }
  return false;
}

function branchMatchesStaff(auth, assignedGymCodeId) {
  const branch = String(assignedGymCodeId || '').trim();
  if (!branch) return authIsMasterOwner(auth);
  if (authIsMasterOwner(auth)) {
    const active = String(auth?.activeBranchId || auth?.gymCodeId || '').trim();
    if (!active) return true;
    return active === branch;
  }
  const allowed = resolveAllowedBranchIds(auth);
  if (allowed === null) return true;
  const list = Array.isArray(allowed) ? allowed.map((id) => String(id).trim()) : [];
  return list.includes(branch);
}

export async function listPendingForViewer(auth) {
  const sb = getSupabase();
  const gid = gymId();
  const cfg = await loadConfig(sb, gid);

  if (authIsMasterOwner(auth) || auth?.access?.__owner) {
    return listOpenPendingForOwner(auth);
  }

  const login = String(auth?.userId || '').trim();
  let sections = Array.isArray(auth?.sections) ? auth.sections : [];
  if (!sections.length && login) {
    const { data: staffRows } = await sb
      .from(T.staff_users)
      .select('id')
      .eq('gym_id', gid)
      .ilike('staff_login_id', login)
      .limit(1);
    const staffRow = Array.isArray(staffRows) && staffRows.length ? staffRows[0] : null;
    if (staffRow?.id) {
      const { data: secRows } = await sb
        .from(T.staff_user_sections)
        .select('section_name')
        .eq('staff_user_id', staffRow.id);
      sections = (secRows || []).map((r) => r.section_name);
    }
  }
  const authWithSections = { ...auth, sections };

  const { data: templates } = await sb
    .from(T.staff_role_templates)
    .select('id, title, sections_json, external_template_id')
    .eq('gym_id', gid)
    .limit(100);

  const roleTemplates = (templates || []).map((r) => ({
    id: r.external_template_id || r.id,
    title: r.title,
    sections: r.sections_json,
  }));

  const { data, error } = await sb
    .from('pt_trainer_expense_pending')
    .select('*')
    .eq('gym_id', gid)
    .in('status', ['pending', 'declined'])
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) throw error;

  return (data || [])
    .map(rowToPending)
    .filter(
      (p) =>
        branchMatchesStaff(authWithSections, p.assignedGymCodeId) &&
        staffMayReceivePtPayoutStaffNotify(authWithSections, p, cfg, roleTemplates),
    );
}

async function loadPendingRow(sb, gid, id) {
  const { data, error } = await sb
    .from('pt_trainer_expense_pending')
    .select('*')
    .eq('gym_id', gid)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function confirmPending(auth, pendingId, methodRaw) {
  const method = String(methodRaw || '').trim().toLowerCase();
  if (method !== 'cash' && method !== 'online') {
    const err = new Error('Choose Cash or Online.');
    err.status = 400;
    throw err;
  }
  const sb = getSupabase();
  const gid = gymId();
  const row = await loadPendingRow(sb, gid, pendingId);
  if (!row || !OPEN_STATUSES.has(row.status)) {
    const err = new Error('Pending payout not found or already closed.');
    err.status = 404;
    throw err;
  }
  const login = String(auth?.userId || '').trim().toLowerCase();
  if (login !== String(row.trainer_staff_login_id || '').trim().toLowerCase()) {
    if (!authIsMasterOwner(auth)) {
      const err = new Error('Only the assigned trainer can confirm this payout.');
      err.status = 403;
      throw err;
    }
  }

  const methodLabel = method === 'online' ? 'Online' : 'Cash';
  const month = monthLabel(row.service_month);
  let gymCodeId = String(row.assigned_gym_code_id || '').trim();
  if (!gymCodeId) {
    gymCodeId = String(auth?.activeBranchId || auth?.gymCodeId || '').trim();
  }
  if (!gymCodeId) {
    const err = new Error('Member has no gym branch; cannot post expense.');
    err.status = 400;
    throw err;
  }
  const expense = await upsertFinanceExpenseRow({
    amount: Number(row.amount_inr),
    category: `PT Payment Trainer (${row.trainer_name || row.trainer_staff_login_id})`,
    note: `PT payout – ${row.member_name || row.member_code} (${month}) • By Staff`,
    method: methodLabel,
    date: new Date().toISOString().slice(0, 10),
    gymCodeId,
    memberName: `PT Payment Trainer (${row.trainer_name || row.trainer_staff_login_id})`,
    plan: 'Expense',
  });

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from('pt_trainer_expense_pending')
    .update({
      status: 'confirmed',
      payment_method: method,
      expense_external_tx_id: expense?.id || expense?.externalTxId || null,
      confirmed_at: now,
      updated_at: now,
    })
    .eq('gym_id', gid)
    .eq('id', row.id)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return { pending: rowToPending(data), expense };
}

export async function declinePending(auth, pendingId) {
  const sb = getSupabase();
  const gid = gymId();
  const row = await loadPendingRow(sb, gid, pendingId);
  if (!row || !OPEN_STATUSES.has(row.status)) {
    const err = new Error('Pending payout not found or already closed.');
    err.status = 404;
    throw err;
  }
  const login = String(auth?.userId || '').trim().toLowerCase();
  if (login !== String(row.trainer_staff_login_id || '').trim().toLowerCase()) {
    const err = new Error('Only the assigned trainer can decline this payout.');
    err.status = 403;
    throw err;
  }
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from('pt_trainer_expense_pending')
    .update({
      status: 'declined',
      declined_at: now,
      updated_at: now,
    })
    .eq('gym_id', gid)
    .eq('id', row.id)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return {
    pending: rowToPending(data),
    ownerMessage: `Trainer ${row.trainer_name || row.trainer_staff_login_id} declined PT payout for ${row.member_name || row.member_code} (${monthLabel(row.service_month)}).`,
  };
}

export async function dismissPending(auth, pendingId) {
  if (!authIsMasterOwner(auth) && !auth?.access?.__owner) {
    const err = new Error('Only the owner can dismiss pending payouts.');
    err.status = 403;
    throw err;
  }
  const sb = getSupabase();
  const gid = gymId();
  const row = await loadPendingRow(sb, gid, pendingId);
  if (!row || !OPEN_STATUSES.has(row.status)) {
    const err = new Error('Pending payout not found or already closed.');
    err.status = 404;
    throw err;
  }
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from('pt_trainer_expense_pending')
    .update({
      status: 'dismissed_by_owner',
      dismissed_at: now,
      dismissed_by_staff_login_id: String(auth?.userId || '').slice(0, 120),
      updated_at: now,
    })
    .eq('gym_id', gid)
    .eq('id', row.id)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return { pending: rowToPending(data) };
}

export { istDateKey, monthLabel, rowToPending };
