import {
  validatePaidMonthKey,
  payMonthKeyFromStoredValue,
} from '../../../../src/features/finance/derivePaidMonth.js';
import { T } from '../tables.js';
import { isMissingDbTableError } from './utils.js';

/**
 * Build month-wise ledger rows from member payment history + membership default month.
 * @returns {object[]}
 */
export function buildPaidForMonthLedgerRows(member, gymId, memberPk) {
  const gid = gymId;
  const memberCode = String(member?.memberId || member?.member_code || '').trim();
  const status = String(member?.status || 'Active').trim() || 'Active';
  const byMonth = new Map();

  const addPayment = (paidForMonth, payment) => {
    const key = validatePaidMonthKey(paidForMonth);
    if (!key) return;
    const amount = Number(payment?.amount || 0);
    const paidAt = payment?.paidAt || payment?.receivedAt || payment?.date || null;
    const existing = byMonth.get(key);
    if (!existing) {
      byMonth.set(key, {
        gym_id: gid,
        member_id: memberPk,
        member_code: memberCode,
        paid_for_month: key,
        amount,
        member_status: status,
        payment_external_id: payment?.id ? String(payment.id) : null,
        paid_at: paidAt,
        recorded_by: payment?.recordedBy || payment?.by || null,
      });
      return;
    }
    existing.amount = Number(existing.amount || 0) + amount;
    if (paidAt && (!existing.paid_at || String(paidAt) > String(existing.paid_at))) {
      existing.paid_at = paidAt;
      existing.payment_external_id = payment?.id ? String(payment.id) : existing.payment_external_id;
    }
  };

  const payments = Array.isArray(member?.paymentHistory) ? member.paymentHistory : [];
  for (const p of payments) {
    const month = validatePaidMonthKey(p.paidMonth)
      || validatePaidMonthKey(p.billingMonth)
      || payMonthKeyFromStoredValue(p.billingMonth);
    addPayment(month, p);
  }

  const memberDefault = payMonthKeyFromStoredValue(member?.payMonth);
  if (memberDefault && !byMonth.has(memberDefault)) {
    byMonth.set(memberDefault, {
      gym_id: gid,
      member_id: memberPk,
      member_code: memberCode,
      paid_for_month: memberDefault,
      amount: Number(member?.amount || 0),
      member_status: status,
      payment_external_id: null,
      paid_at: null,
      recorded_by: member?.updatedBy || null,
    });
  }

  return [...byMonth.values()];
}

/** Replace ledger rows for one member (source of truth = payment history + payMonth). */
export async function syncMemberPaidForMonthLedger(sb, { gymId, memberPk, member }) {
  if (!gymId || !memberPk || !member) return;
  const rows = buildPaidForMonthLedgerRows(member, gymId, memberPk);
  const { error: delErr } = await sb
    .from(T.member_paid_for_month)
    .delete()
    .eq('gym_id', gymId)
    .eq('member_id', memberPk);
  if (delErr && !isMissingDbTableError(delErr)) {
    throw new Error(`member_paid_for_month delete: ${delErr.message}`);
  }
  if (delErr) return;
  if (!rows.length) return;
  const { error: insErr } = await sb
    .from(T.member_paid_for_month)
    .upsert(rows, { onConflict: 'gym_id,member_id,paid_for_month' });
  if (insErr) throw new Error(`member_paid_for_month upsert: ${insErr.message}`);
}

/**
 * Map DB ledger rows to finance paymentRecords shape.
 * @param {object[]} rows
 * @param {Map<number, { member_code: string, name: string, status: string }>} memberPkToMeta
 */
/** True when member_paid_for_month table exists (migration applied). */
export async function memberPaidForMonthLedgerReady(sb) {
  const { error } = await sb.from(T.member_paid_for_month).select('member_id').limit(1);
  if (error) {
    if (/member_paid_for_month|does not exist|42P01/i.test(error.message)) return false;
    throw new Error(`memberPaidForMonthLedgerReady: ${error.message}`);
  }
  return true;
}

/** Sum ledger amounts for all scoped members in one service month (historical revenue). */
export async function sumPaidForMonthLedger(sb, gymId, monthKey, memberPks = []) {
  const key = String(monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(key)) return 0;
  const pks = (Array.isArray(memberPks) ? memberPks : []).filter(Boolean);
  if (!pks.length) return 0;
  const chunkSize = 100;
  let total = 0;
  for (let i = 0; i < pks.length; i += chunkSize) {
    const slice = pks.slice(i, i + chunkSize);
    const { data, error } = await sb
      .from(T.member_paid_for_month)
      .select('amount')
      .eq('gym_id', gymId)
      .eq('paid_for_month', key)
      .in('member_id', slice);
    if (error) {
      if (/member_paid_for_month|does not exist|42P01/i.test(error.message)) return 0;
      throw new Error(`sumPaidForMonthLedger: ${error.message}`);
    }
    total += (data || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  }
  return total;
}

/** @deprecated Use sumPaidForMonthLedger — kept for callers passing active-only PK lists. */
export async function sumActivePaidForMonthLedger(sb, gymId, monthKey, activeMemberPks = []) {
  return sumPaidForMonthLedger(sb, gymId, monthKey, activeMemberPks);
}

/**
 * Read one ledger row for a member + service month.
 */
export async function readMemberPaidForMonthLedgerRow(sb, gymId, memberPk, monthKey) {
  const key = String(monthKey || '').trim();
  if (!/^\d{4}-\d{2}$/.test(key)) return null;
  const { data, error } = await sb
    .from(T.member_paid_for_month)
    .select('id, amount, paid_for_month, member_code, member_status')
    .eq('gym_id', gymId)
    .eq('member_id', memberPk)
    .eq('paid_for_month', key)
    .maybeSingle();
  if (error) {
    if (/member_paid_for_month|does not exist|42P01/i.test(error.message)) return null;
    throw new Error(`readMemberPaidForMonthLedgerRow: ${error.message}`);
  }
  return data || null;
}

/**
 * Override paid-for-month ledger amount with audit trail.
 */
export async function patchMemberPaidForMonthAmount(sb, {
  gymId,
  memberPk,
  memberCode,
  monthKey,
  newAmount,
  changedBy,
  overrideReason,
}) {
  const key = String(monthKey || '').trim();
  const amount = Number(newAmount);
  if (!/^\d{4}-\d{2}$/.test(key) || !Number.isFinite(amount) || amount < 0) {
    const err = new Error('invalid-paid-for-month-amount');
    err.status = 400;
    throw err;
  }
  const existing = await readMemberPaidForMonthLedgerRow(sb, gymId, memberPk, key);
  const oldAmount = Number(existing?.amount || 0);
  if (existing && oldAmount === amount) {
    return { ok: true, changed: false, paidForMonth: key, amount };
  }
  const row = {
    gym_id: gymId,
    member_id: memberPk,
    member_code: String(memberCode || '').trim(),
    paid_for_month: key,
    amount,
    member_status: String(existing?.member_status || 'Active'),
    updated_at: new Date().toISOString(),
  };
  const { error: upsertErr } = await sb
    .from(T.member_paid_for_month)
    .upsert(row, { onConflict: 'gym_id,member_id,paid_for_month' });
  if (upsertErr) throw new Error(`member_paid_for_month override: ${upsertErr.message}`);

  try {
    await sb.from(T.member_paid_for_month_amount_audit).insert({
      gym_id: gymId,
      member_id: memberPk,
      member_code: row.member_code,
      paid_for_month: key,
      old_amount: oldAmount,
      new_amount: amount,
      changed_by: changedBy || null,
      override_reason: overrideReason || null,
    });
  } catch (auditErr) {
    const msg = String(auditErr?.message || auditErr);
    if (!/member_paid_for_month_amount_audit|does not exist|42P01/i.test(msg)) throw auditErr;
  }
  return { ok: true, changed: true, paidForMonth: key, oldAmount, newAmount: amount };
}

export function mapPaidForMonthLedgerToPaymentRecords(rows, memberPkToMeta) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const meta = memberPkToMeta.get(row.member_id) || {};
    return {
      id: row.payment_external_id || `ledger-${row.member_id}-${row.paid_for_month}`,
      memberId: meta.member_code || row.member_code,
      memberName: meta.name || '',
      memberStatus: meta.status || row.member_status || '',
      paidAt: row.paid_at,
      amount: Number(row.amount || 0),
      paidMonth: row.paid_for_month,
      billingMonth: row.paid_for_month,
      method: '',
      source: 'paid_for_month_ledger',
    };
  });
}
