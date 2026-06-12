/**
 * Revenue breakdown: Membership / PT / Other from ledger income rows.
 */

import { isPtPlanName, PT_PLAN_RE } from '../pt/ptEligibility.js';

/**
 * @param {object} row ledger income row
 * @param {object} ctx
 * @param {Set<string>|string[]} [ctx.ptClientMemberIds]
 * @param {(id: string) => object|undefined} [ctx.memberById]
 */
export function classifyRevenueBucket(row, ctx = {}) {
  if (!row || row.type === 'expense') return 'other';
  const source = String(row.source || '').toLowerCase();
  if (source === 'manual' || row.type === 'expense') return 'other';

  const memberId = String(row.memberId || '').trim();
  const ptIds = ctx.ptClientMemberIds;
  const inPtList = ptIds instanceof Set
    ? ptIds.has(memberId)
    : (Array.isArray(ptIds) ? ptIds.includes(memberId) : false);

  const plan = String(row.plan || '');
  const member = typeof ctx.memberById === 'function' && memberId
    ? ctx.memberById(memberId)
    : null;
  const memberPlan = String(member?.plan || plan);

  if (PT_PLAN_RE.test(plan) || isPtPlanName(memberPlan)) {
    return 'pt';
  }
  if (inPtList && member && isPtPlanName(member.plan)) {
    return 'pt';
  }
  if (source === 'payment' || source === 'billing-pending') {
    return 'membership';
  }
  return 'other';
}

/**
 * @param {object[]} incomeRows paid/collected income rows for reporting month
 * @param {object} ctx — see classifyRevenueBucket
 * @returns {{ membership: number, pt: number, other: number, total: number }}
 */
export function buildRevenueBreakdown(incomeRows, ctx = {}) {
  const buckets = { membership: 0, pt: 0, other: 0 };
  for (const row of Array.isArray(incomeRows) ? incomeRows : []) {
    if (!row || row.type === 'expense') continue;
    if (String(row.status || '').toLowerCase() === 'pending') continue;
    const key = classifyRevenueBucket(row, ctx);
    buckets[key] += Number(row.amount || 0);
  }
  const total = buckets.membership + buckets.pt + buckets.other;
  return { ...buckets, total };
}

/**
 * @param {object} settings
 * @returns {Set<string>}
 */
/**
 * @param {object} settings
 * @param {object[]} [members] when provided, drops orphaned profile keys for non-PT members
 */
export function ptClientMemberIdSet(settings, members = null) {
  const profiles = settings?.ptClientProfiles;
  if (!profiles || typeof profiles !== 'object') return new Set();
  const keys = Object.keys(profiles).map((k) => String(k).trim()).filter(Boolean);
  if (!Array.isArray(members) || members.length === 0) return new Set(keys);
  const memberById = new Map(members.map((m) => [String(m.memberId || '').trim(), m]));
  return new Set(keys.filter((id) => {
    const member = memberById.get(id);
    return member ? isPtPlanName(member.plan) : false;
  }));
}
