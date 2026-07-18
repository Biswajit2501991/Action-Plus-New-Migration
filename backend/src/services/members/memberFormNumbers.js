import { T } from '../../db/tables.js';
import { getSupabase, gymId } from '../../db/supabase/client.js';
import { fetchAll } from '../../db/supabase/utils.js';
import { loadBlockedMemberCodes } from '../../db/supabase/memberDeleteGuard.js';

function toPositiveInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export function buildBranchMemberId(formNo, yearSuffix, branchToken) {
  const safeNo = String(formNo || '').trim();
  const safeYear = String(yearSuffix || '').trim();
  const safeBranch = String(branchToken || '').trim().toUpperCase() || 'BR';
  return `APG-${safeNo}/${safeYear}-${safeBranch}`;
}

/**
 * Next form number for a branch that is free of active, soft-deleted, and audited codes.
 */
export async function suggestNextBranchFormNumber({
  gymCodeId,
  branchToken,
  yearSuffix = String(new Date().getFullYear()).slice(-2),
  startFrom = null,
} = {}) {
  const branchId = String(gymCodeId || '').trim();
  if (!branchId) {
    const err = new Error('branch-required');
    err.status = 400;
    throw err;
  }

  const sb = getSupabase();
  const gid = gymId();
  const token = String(branchToken || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || 'BR';
  const year = String(yearSuffix || '').trim() || String(new Date().getFullYear()).slice(-2);

  const rows = await fetchAll((from, to) => sb
    .from(T.members)
    .select('form_no, member_code, deleted_at')
    .eq('gym_id', gid)
    .eq('assigned_gym_code_id', branchId)
    .range(from, to));

  const formNums = (rows || [])
    .map((r) => toPositiveInt(r.form_no))
    .filter((n) => n != null);
  let next = toPositiveInt(startFrom) || ((formNums.length ? Math.max(...formNums) : 0) + 1);

  const blocked = await loadBlockedMemberCodes(sb, gid);
  for (const r of rows || []) {
    const code = String(r.member_code || '').trim();
    if (code) blocked.add(code);
  }

  for (let i = 0; i < 5000; i += 1) {
    const candidate = buildBranchMemberId(next, year, token);
    if (!blocked.has(candidate)) {
      return {
        formNo: next,
        memberId: candidate,
        branchToken: token,
        yearSuffix: year,
      };
    }
    next += 1;
  }

  const err = new Error('no-free-form-number');
  err.status = 500;
  throw err;
}
