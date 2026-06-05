import { T } from '../tables.js';
import { fetchAll, isMissingDbTableError } from './utils.js';

/** Apply active-member filter when deleted_at column exists. */
export function applyActiveMembersFilter(query) {
  return query.is('deleted_at', null);
}

/**
 * Load member_codes that must never be bulk-inserted/updated (resurrection block).
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} gymId
 * @param {string[]} [extraCodes] — e.g. deletedMemberIds from bulk PUT body
 */
export async function loadBlockedMemberCodes(sb, gymId, extraCodes = []) {
  const blocked = new Set(
    (Array.isArray(extraCodes) ? extraCodes : [])
      .map((c) => String(c || '').trim())
      .filter(Boolean),
  );

  try {
    const softDeleted = await fetchAll((from, to) => sb
      .from(T.members)
      .select('member_code')
      .eq('gym_id', gymId)
      .not('deleted_at', 'is', null)
      .range(from, to));
    for (const row of softDeleted || []) {
      const code = String(row?.member_code || '').trim();
      if (code) blocked.add(code);
    }
  } catch (err) {
    const msg = String(err?.message || err);
    if (!/deleted_at|column.*does not exist|42703/i.test(msg)) throw err;
  }

  try {
    const audited = await fetchAll((from, to) => sb
      .from(T.member_delete_audit)
      .select('member_code')
      .eq('gym_id', gymId)
      .range(from, to));
    for (const row of audited || []) {
      const code = String(row?.member_code || '').trim();
      if (code) blocked.add(code);
    }
  } catch (err) {
    if (!isMissingDbTableError(err)) {
      const msg = String(err?.message || err);
      if (!/member_delete_audit|does not exist|42P01/i.test(msg)) throw err;
    }
  }

  return blocked;
}

/** Drop members whose codes are in the blocked set (bulk resurrection guard). */
export function filterMembersBlockedFromBulkWrite(members, blockedSet) {
  const blocked = blockedSet instanceof Set ? blockedSet : new Set();
  const incoming = Array.isArray(members) ? members : [];
  const allowed = [];
  const skipped = [];
  for (const m of incoming) {
    const code = String(m?.memberId || '').trim();
    if (code && blocked.has(code)) {
      skipped.push(code);
      continue;
    }
    allowed.push(m);
  }
  return { allowed, skipped };
}

/**
 * Record permanent delete in audit table (idempotent per gym_id + member_code).
 */
export async function recordMemberDeleteAudit(sb, {
  gymId,
  memberCode,
  memberPk = null,
  deletedBy = null,
}) {
  const code = String(memberCode || '').trim();
  if (!gymId || !code) return;
  const row = {
    gym_id: gymId,
    member_id: memberPk || null,
    member_code: code,
    deleted_at: new Date().toISOString(),
    deleted_by: deletedBy ? String(deletedBy).trim() : null,
  };
  const { error } = await sb
    .from(T.member_delete_audit)
    .upsert(row, { onConflict: 'gym_id,member_code' });
  if (error) {
    if (isMissingDbTableError(error)) return;
    throw new Error(`member_delete_audit upsert: ${error.message}`);
  }
}
