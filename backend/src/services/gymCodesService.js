import { T } from '../db/tables.js';
import { getSupabase, gymId } from '../db/supabase/client.js';

function normalizeCode(raw) {
  return String(raw || '').trim().toUpperCase();
}

export async function listGymCodes() {
  const sb = getSupabase();
  const gid = gymId();
  const fullSelect = 'id, gym_id, code, name, display_name, logo_url, branding_updated_at, shift_start_time, shift_timezone, created_at';
  const baseSelect = 'id, gym_id, code, name, display_name, logo_url, branding_updated_at, created_at';
  let { data, error } = await sb
    .from(T.gym_codes)
    .select(fullSelect)
    .eq('gym_id', gid)
    .order('code', { ascending: true });
  if (error && /shift_start|shift_timezone|column/i.test(String(error.message || ''))) {
    ({ data, error } = await sb
      .from(T.gym_codes)
      .select(baseSelect)
      .eq('gym_id', gid)
      .order('code', { ascending: true }));
  }
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    branchName: row.name,
    displayName: row.display_name || null,
    logoUrl: row.logo_url || null,
    shiftStartTime: row.shift_start_time ? String(row.shift_start_time).slice(0, 5) : null,
    shiftTimezone: row.shift_timezone || 'IST',
    createdAt: row.created_at,
  }));
}

export async function updateGymCodeShift(id, { shiftStartTime, shiftTimezone }) {
  const sb = getSupabase();
  const gid = gymId();
  const codeId = String(id || '').trim();
  if (!codeId) throw new Error('id-required');
  const patch = { shift_timezone: String(shiftTimezone || 'IST').trim() || 'IST' };
  const time = String(shiftStartTime || '').trim();
  if (time) {
    const match = time.match(/^(\d{1,2}):(\d{2})/);
    if (!match) throw new Error('invalid-shift-time');
    patch.shift_start_time = `${match[1].padStart(2, '0')}:${match[2]}:00`;
  } else {
    patch.shift_start_time = null;
  }
  const { data, error } = await sb
    .from(T.gym_codes)
    .update(patch)
    .eq('gym_id', gid)
    .eq('id', codeId)
    .select('id, code, name, shift_start_time, shift_timezone')
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id,
    code: data.code,
    name: data.name,
    shiftStartTime: data.shift_start_time ? String(data.shift_start_time).slice(0, 5) : null,
    shiftTimezone: data.shift_timezone || 'IST',
  };
}

export async function createGymCode({ code, name }) {
  const sb = getSupabase();
  const gid = gymId();
  const normalized = normalizeCode(code);
  const branchName = String(name || '').trim();
  if (!normalized) throw new Error('code-required');
  if (!branchName) throw new Error('name-required');

  const { data, error } = await sb
    .from(T.gym_codes)
    .insert({ gym_id: gid, code: normalized, name: branchName })
    .select('id, code, name, created_at')
    .single();
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('unique') || error.code === '23505') {
      throw new Error('code-exists');
    }
    if (/gym_codes|schema cache|does not exist/i.test(msg)) {
      throw new Error(
        'gym_codes table missing — run backend/migrations/supabase_gym_codes.sql in Supabase',
      );
    }
    throw new Error(msg);
  }
  const created = {
    id: data.id,
    code: data.code,
    name: data.name,
    branchName: data.name,
    createdAt: data.created_at,
  };
  try {
    const { seedBranchWhatsappTemplatesFromHq } = await import('./branchWhatsappTemplates.js');
    await seedBranchWhatsappTemplatesFromHq(created.id);
  } catch {
    /* migration may not be applied yet */
  }
  return created;
}

export async function deleteGymCode(id) {
  const sb = getSupabase();
  const gid = gymId();
  const codeId = String(id || '').trim();
  if (!codeId) throw new Error('id-required');

  const { count: staffCount, error: staffErr } = await sb
    .from(T.staff_users)
    .select('id', { count: 'exact', head: true })
    .eq('gym_id', gid)
    .eq('gym_code_id', codeId);
  if (staffErr) throw new Error(staffErr.message);
  if ((staffCount || 0) > 0) throw new Error('code-in-use-staff');

  const { count: memberCount, error: memberErr } = await sb
    .from(T.members)
    .select('id', { count: 'exact', head: true })
    .eq('gym_id', gid)
    .eq('assigned_gym_code_id', codeId);
  if (memberErr) throw new Error(memberErr.message);
  if ((memberCount || 0) > 0) throw new Error('code-in-use-members');

  const { error } = await sb.from(T.gym_codes).delete().eq('gym_id', gid).eq('id', codeId);
  if (error) throw new Error(error.message);
  return true;
}

export async function resolveGymCodeId(codeOrId) {
  const raw = String(codeOrId || '').trim();
  if (!raw) return null;
  const sb = getSupabase();
  const gid = gymId();
  const byId = await sb.from(T.gym_codes).select('id').eq('gym_id', gid).eq('id', raw).maybeSingle();
  if (byId.data?.id) return String(byId.data.id);
  const { data } = await sb
    .from(T.gym_codes)
    .select('id')
    .eq('gym_id', gid)
    .eq('code', normalizeCode(raw))
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}
