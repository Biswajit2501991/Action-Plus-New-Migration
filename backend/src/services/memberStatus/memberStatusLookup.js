import { getSupabase } from '../../db/supabase/client.js';

/** Digits-only mobile (matches DB apg_normalize_mobile). */
export function normalizeMobile(raw) {
  return String(raw || '').replace(/\D/g, '');
}

function mapLookupRow(row) {
  return {
    memberId: row.member_id,
    memberCode: row.member_code,
    fullName: row.full_name,
    mobile: row.mobile,
    status: row.status,
    isActive: Boolean(row.is_active),
    updatedAt: row.updated_at,
  };
}

/** All member rows for a mobile in a gym (may be >1 when mobile is shared). */
export async function getMemberStatusByMobile(mobile, gymId) {
  const sb = getSupabase();
  const { data, error } = await sb.rpc('get_member_status_by_mobile', {
    p_mobile: mobile,
    p_gym_id: gymId || null,
  });
  if (error) {
    const err = new Error(`member-status-lookup: ${error.message}`);
    err.status = 500;
    throw err;
  }
  return (Array.isArray(data) ? data : []).map(mapLookupRow);
}

/** True when any matching member row has status Active. */
export async function isMemberActiveByMobile(mobile, gymId) {
  const sb = getSupabase();
  const { data, error } = await sb.rpc('is_member_active_by_mobile', {
    p_mobile: mobile,
    p_gym_id: gymId || null,
  });
  if (error) {
    const err = new Error(`member-status-active-check: ${error.message}`);
    err.status = 500;
    throw err;
  }
  return Boolean(data);
}
