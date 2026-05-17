import { T } from '../tables.js';
import { getSupabase, gymId } from './client.js';
import { chunk } from './utils.js';

let bulkUpsertEnabled = null;

/** Cached probe: UNIQUE (gym_id, member_code) enables single-request bulk upsert. */
export async function membersBulkUpsertReady(force = false) {
  if (!force && bulkUpsertEnabled !== null) return bulkUpsertEnabled;
  const sb = getSupabase();
  const gid = gymId();
  const probe = {
    gym_id: gid,
    member_code: '__upsert_probe__',
    full_name: 'Probe',
    email: 'probe@test.local',
    mobile: '0000000000',
    status: 'Active',
    medical_skipped: false,
    ack_accepted: false,
  };
  const { error } = await sb.from(T.members).upsert(probe, { onConflict: 'gym_id,member_code' });
  await sb.from(T.members).delete().eq('gym_id', gid).eq('member_code', '__upsert_probe__');
  bulkUpsertEnabled = !error;
  return bulkUpsertEnabled;
}

export function resetMembersBulkUpsertCache() {
  bulkUpsertEnabled = null;
}

export async function bulkUpsertMemberRows(memberRows) {
  const sb = getSupabase();
  for (const part of chunk(memberRows, 80)) {
    const { error } = await sb.from(T.members).upsert(part, { onConflict: 'gym_id,member_code' });
    if (error) throw new Error(`members upsert: ${error.message}`);
  }
}
