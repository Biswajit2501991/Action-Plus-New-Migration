import { T } from '../../db/tables.js';
import { getSupabase, gymId } from '../../db/supabase/client.js';
import { isOwnerAuth } from '../../middleware/requireOwner.js';
import {
  assertBranchInScope,
  authIsMasterOwner,
  resolveActiveBranchId,
  resolveAllowedBranchIds,
} from '../../auth/tenant/scopedAuth.js';

const MAX_LOGO_BYTES = 512 * 1024;
const ALLOWED_LOGO_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

const BRANDING_COLUMNS = 'id, gym_id, code, name, display_name, logo_url, branding_updated_at';

function assertCanManageBranding(auth) {
  if (isOwnerAuth(auth) || authIsMasterOwner(auth)) return;
  const err = new Error('owner-required');
  err.status = 403;
  throw err;
}

function toBrandingDto(row) {
  if (!row) return null;
  const branchName = String(row.name || '').trim();
  const displayRaw = String(row.display_name || '').trim();
  const displayName = displayRaw || (branchName ? `Action Plus ${branchName}` : 'Action Plus Gym');
  const logoRaw = String(row.logo_url || '').trim();
  return {
    gymCodeId: String(row.id),
    code: String(row.code || '').trim(),
    branchName,
    displayName,
    logoUrl: logoRaw || null,
    usesDefaultLogo: !logoRaw,
    updatedAt: row.branding_updated_at || null,
  };
}

async function fetchBranchRow(gymCodeId) {
  const sb = getSupabase();
  const gid = gymId();
  const id = String(gymCodeId || '').trim();
  if (!id) {
    const err = new Error('branch-id-required');
    err.status = 400;
    throw err;
  }
  const { data, error } = await sb
    .from(T.gym_codes)
    .select(BRANDING_COLUMNS)
    .eq('gym_id', gid)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const err = new Error('branch-not-found');
    err.status = 404;
    throw err;
  }
  return data;
}

export async function resolveBrandingForAuth(auth, gymCodeId) {
  const targetId = String(gymCodeId || resolveActiveBranchId(auth) || '').trim();
  if (!targetId) {
    const err = new Error('active-branch-required');
    err.status = 400;
    throw err;
  }
  assertBranchInScope(auth, targetId);
  const row = await fetchBranchRow(targetId);
  return toBrandingDto(row);
}

export async function listBranchBrandingForAuth(auth) {
  const sb = getSupabase();
  const gid = gymId();
  const allowed = resolveAllowedBranchIds(auth);
  let query = sb.from(T.gym_codes).select(BRANDING_COLUMNS).eq('gym_id', gid).order('code', { ascending: true });
  if (allowed !== null) {
    if (!allowed.length) return [];
    query = query.in('id', allowed);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map((row) => toBrandingDto(row));
}

export async function updateBranchBranding(auth, gymCodeId, { displayName, clearLogo } = {}) {
  assertCanManageBranding(auth);
  const id = String(gymCodeId || '').trim();
  await fetchBranchRow(id);

  const patch = { branding_updated_at: new Date().toISOString() };
  if (displayName !== undefined) {
    const next = String(displayName || '').trim();
    patch.display_name = next || null;
  }
  if (clearLogo) patch.logo_url = null;

  const sb = getSupabase();
  const gid = gymId();
  const { data, error } = await sb
    .from(T.gym_codes)
    .update(patch)
    .eq('gym_id', gid)
    .eq('id', id)
    .select(BRANDING_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return toBrandingDto(data);
}

export async function uploadBranchBrandingLogo(auth, gymCodeId, { buffer, mime }) {
  assertCanManageBranding(auth);
  const id = String(gymCodeId || '').trim();
  await fetchBranchRow(id);

  const normalizedMime = String(mime || '').toLowerCase();
  if (!ALLOWED_LOGO_MIMES.has(normalizedMime)) {
    const err = new Error('logo-mime-invalid');
    err.status = 400;
    throw err;
  }
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    const err = new Error('logo-data-required');
    err.status = 400;
    throw err;
  }
  if (buffer.length > MAX_LOGO_BYTES) {
    const err = new Error('logo-too-large');
    err.status = 400;
    throw err;
  }

  const dataUrl = `data:${normalizedMime};base64,${buffer.toString('base64')}`;
  const sb = getSupabase();
  const gid = gymId();
  const { data, error } = await sb
    .from(T.gym_codes)
    .update({
      logo_url: dataUrl,
      branding_updated_at: new Date().toISOString(),
    })
    .eq('gym_id', gid)
    .eq('id', id)
    .select(BRANDING_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return toBrandingDto(data);
}
