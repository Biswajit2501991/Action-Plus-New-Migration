import { T } from '../../db/tables.js';
import { getSupabase, gymId } from '../../db/supabase/client.js';
import { isMissingDbTableError } from '../../db/supabase/utils.js';
import { authHasGlobalBranchRead } from '../../auth/branchFilter.js';
import { resolveEffectiveTemplateBranchId } from '../branchWhatsappTemplates.js';
import { parseMemberPhotoImagePayload } from '../memberPhoto/parseImagePayload.js';
import {
  MEMBER_PHOTO_ALLOWED_MIMES,
  buildPaymentQrStoragePath,
  memberPhotoStorageEnabled,
  mimeToExtension,
} from '../memberPhoto/storageConstants.js';
import {
  createMemberPhotoSignedUrl,
  deleteMemberPhotoObject,
  uploadMemberPhotoObject,
} from '../memberPhoto/MemberPhotoStorageManager.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PAYMENT_QR_MIGRATION_HINT =
  'Run backend/migrations/supabase_payment_qr_settings.sql and '
  + 'backend/migrations/supabase_payment_qr_settings_rls.sql in Supabase SQL Editor.';

export { resolveEffectiveTemplateBranchId };

function rethrowPaymentQrDbError(error) {
  if (isMissingDbTableError(error)) {
    throw Object.assign(new Error('payment-qr-table-missing'), {
      status: 503,
      detail: PAYMENT_QR_MIGRATION_HINT,
    });
  }
  throw error;
}

function assertBranchUuid(id) {
  const safe = String(id || '').trim();
  if (!UUID_RE.test(safe)) {
    const err = new Error('invalid-gym-code-id');
    err.status = 400;
    throw err;
  }
  return safe;
}

export function assertValidPaymentQrId(id) {
  const safe = String(id || '').trim();
  if (!UUID_RE.test(safe)) {
    throw Object.assign(new Error('invalid-payment-qr-id'), { status: 400 });
  }
  return safe;
}

function normalizeQrName(name) {
  const safe = String(name || '').trim();
  if (!safe) {
    throw Object.assign(new Error('qr-name-required'), { status: 400 });
  }
  if (safe.length > 80) {
    throw Object.assign(new Error('qr-name-too-long'), { status: 413 });
  }
  return safe;
}

function slugFromQrName(name) {
  let base = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  if (!base) return 'qr';
  if (!/^[a-z]/.test(base)) base = `q_${base}`;
  return base.slice(0, 64);
}

/** @param {Record<string, unknown>} row */
export function paymentQrRowToApp(row, branchMeta = null) {
  if (!row) return null;
  const branch = branchMeta || {};
  return {
    id: String(row.id || ''),
    gymCodeId: String(row.gym_code_id || ''),
    gymCode: String(branch.code || ''),
    branchName: String(branch.name || ''),
    branchLabel: branch.code && branch.name
      ? `${branch.name} (${branch.code})`
      : String(branch.name || branch.code || ''),
    qrName: String(row.qr_name || ''),
    qrImagePath: row.qr_image_path == null ? null : String(row.qr_image_path),
    imageVersion: Number(row.image_version || 0),
    displayOrder: Number(row.display_order || 0),
    isActive: row.is_active !== false,
    createdBy: row.created_by == null ? null : String(row.created_by),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    qrImageUrl: null,
  };
}

async function loadBranchMetaMap(branchIds = []) {
  const unique = [...new Set((branchIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const map = new Map();
  if (!unique.length) return map;
  const sb = getSupabase();
  const gid = gymId();
  const { data, error } = await sb
    .from(T.gym_codes)
    .select('id, code, name')
    .eq('gym_id', gid)
    .in('id', unique);
  if (error) throw error;
  for (const row of data || []) {
    map.set(String(row.id), { code: String(row.code || ''), name: String(row.name || '') });
  }
  return map;
}

async function enrichPaymentQrRows(rows, { signImages = true } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const branchIds = list.map((r) => r.gym_code_id);
  const branchMap = await loadBranchMetaMap(branchIds);
  const apps = list.map((row) => paymentQrRowToApp(row, branchMap.get(String(row.gym_code_id)))).filter(Boolean);

  if (!signImages || !memberPhotoStorageEnabled()) return apps;

  await Promise.all(apps.map(async (item) => {
    if (!item.qrImagePath) return;
    item.qrImageUrl = await createMemberPhotoSignedUrl(item.qrImagePath);
  }));

  return apps;
}

async function nextDisplayOrder(sb, gid, branchId) {
  const { data, error } = await sb
    .from(T.payment_qr_settings)
    .select('display_order')
    .eq('gym_id', gid)
    .eq('gym_code_id', branchId)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) rethrowPaymentQrDbError(error);
  return Number(data?.display_order || 0) + 1;
}

/**
 * List payment QR settings.
 * - Staff: always scoped to JWT branch; activeOnly defaults true.
 * - Owner: optional gymCodeId filter; all branches when omitted.
 */
export async function listPaymentQrSettings(auth, options = {}) {
  const sb = getSupabase();
  const gid = gymId();
  const activeOnly = options.activeOnly !== false;
  const includeInactive = options.includeInactive === true;
  const signImages = options.signImages !== false;

  let query = sb
    .from(T.payment_qr_settings)
    .select('*')
    .eq('gym_id', gid)
    .order('display_order', { ascending: true })
    .order('qr_name', { ascending: true });

  if (authHasGlobalBranchRead(auth)) {
    const rawBranch = String(options.gymCodeId || '').trim();
    if (rawBranch) {
      const branchId = assertBranchUuid(await resolveEffectiveTemplateBranchId(auth, rawBranch));
      query = query.eq('gym_code_id', branchId);
    }
    if (!includeInactive && activeOnly) {
      query = query.eq('is_active', true);
    }
  } else {
    const branchId = assertBranchUuid(await resolveEffectiveTemplateBranchId(auth, options.gymCodeId));
    query = query.eq('gym_code_id', branchId);
    if (activeOnly) query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) rethrowPaymentQrDbError(error);

  const items = await enrichPaymentQrRows(data || [], { signImages });
  const gymCodeId = items[0]?.gymCodeId
    || (authHasGlobalBranchRead(auth) ? String(options.gymCodeId || '').trim() : String(auth?.gymCodeId || auth?.activeBranchId || '').trim())
    || null;

  return { gymCodeId, items };
}

async function loadPaymentQrForBranch(qrId, branchId) {
  const sb = getSupabase();
  const gid = gymId();
  const safeId = assertValidPaymentQrId(qrId);
  const safeBranch = assertBranchUuid(branchId);
  const { data, error } = await sb
    .from(T.payment_qr_settings)
    .select('*')
    .eq('gym_id', gid)
    .eq('gym_code_id', safeBranch)
    .eq('id', safeId)
    .maybeSingle();
  if (error) rethrowPaymentQrDbError(error);
  if (!data) {
    throw Object.assign(new Error('payment-qr-not-found'), { status: 404 });
  }
  return data;
}

/** @returns {Promise<object>} */
export async function createPaymentQrSetting(auth, payload, meta = {}) {
  if (!authHasGlobalBranchRead(auth)) {
    throw Object.assign(new Error('payment-qr-manage-forbidden'), { status: 403 });
  }

  const sb = getSupabase();
  const gid = gymId();
  const branchId = assertBranchUuid(await resolveEffectiveTemplateBranchId(
    auth,
    payload?.gymCodeId || payload?.gym_code_id,
  ));
  const qrName = normalizeQrName(payload?.qrName || payload?.qr_name);
  const nowIso = new Date().toISOString();
  const displayOrder = Number.isFinite(Number(payload?.displayOrder ?? payload?.display_order))
    ? Math.max(0, Math.floor(Number(payload.displayOrder ?? payload.display_order)))
    : await nextDisplayOrder(sb, gid, branchId);
  const isActive = payload?.isActive !== false && payload?.is_active !== false;

  const { data, error } = await sb
    .from(T.payment_qr_settings)
    .insert({
      gym_id: gid,
      gym_code_id: branchId,
      qr_name: qrName,
      display_order: displayOrder,
      is_active: isActive,
      image_version: 0,
      created_by: String(meta.createdBy || auth?.userId || '').trim() || null,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('*')
    .single();

  if (error) rethrowPaymentQrDbError(error);
  const [item] = await enrichPaymentQrRows([data], { signImages: false });
  return item;
}

/** @returns {Promise<object>} */
export async function updatePaymentQrSetting(auth, qrId, payload) {
  if (!authHasGlobalBranchRead(auth)) {
    throw Object.assign(new Error('payment-qr-manage-forbidden'), { status: 403 });
  }

  const branchId = assertBranchUuid(await resolveEffectiveTemplateBranchId(
    auth,
    payload?.gymCodeId || payload?.gym_code_id,
  ));
  const existing = await loadPaymentQrForBranch(qrId, branchId);
  const sb = getSupabase();
  const gid = gymId();
  const safeId = assertValidPaymentQrId(qrId);
  const patch = { updated_at: new Date().toISOString() };

  if (payload?.qrName != null || payload?.qr_name != null) {
    patch.qr_name = normalizeQrName(payload?.qrName ?? payload?.qr_name);
  }
  if (payload?.displayOrder != null || payload?.display_order != null) {
    patch.display_order = Math.max(0, Math.floor(Number(payload?.displayOrder ?? payload?.display_order)));
  }
  if (payload?.isActive != null || payload?.is_active != null) {
    patch.is_active = payload?.isActive !== false && payload?.is_active !== false;
  }

  const { data, error } = await sb
    .from(T.payment_qr_settings)
    .update(patch)
    .eq('gym_id', gid)
    .eq('gym_code_id', branchId)
    .eq('id', safeId)
    .select('*')
    .single();

  if (error) rethrowPaymentQrDbError(error);

  if (patch.qr_name && existing.qr_image_path && patch.qr_name !== existing.qr_name) {
    // Image path slug is stable from create time; name change does not move storage.
  }

  const [item] = await enrichPaymentQrRows([data], { signImages: true });
  return item;
}

/** @returns {Promise<{ item: object, photoUrl: string|null }>} */
export async function uploadPaymentQrImage(auth, qrId, imagePayload, options = {}) {
  if (!authHasGlobalBranchRead(auth)) {
    throw Object.assign(new Error('payment-qr-manage-forbidden'), { status: 403 });
  }
  if (!memberPhotoStorageEnabled()) {
    throw Object.assign(new Error('member-photo-storage-disabled'), { status: 503 });
  }

  const parsed = parseMemberPhotoImagePayload(imagePayload);
  if (!parsed || !MEMBER_PHOTO_ALLOWED_MIMES.has(parsed.mime)) {
    throw Object.assign(new Error('invalid-image-payload'), { status: 400 });
  }

  const branchId = assertBranchUuid(await resolveEffectiveTemplateBranchId(
    auth,
    options?.gymCodeId || options?.gym_code_id,
  ));
  const existing = await loadPaymentQrForBranch(qrId, branchId);
  const sb = getSupabase();
  const gid = gymId();
  const safeId = assertValidPaymentQrId(qrId);
  const nextVersion = Math.max(0, Number(existing.image_version || 0)) + 1;
  const slug = slugFromQrName(existing.qr_name);
  const ext = mimeToExtension(parsed.mime);
  const storagePath = buildPaymentQrStoragePath(gid, branchId, slug, nextVersion, ext);
  const previousPath = existing.qr_image_path ? String(existing.qr_image_path) : null;

  await uploadMemberPhotoObject(storagePath, parsed.buffer, parsed.mime);

  const { data, error } = await sb
    .from(T.payment_qr_settings)
    .update({
      qr_image_path: storagePath,
      image_version: nextVersion,
      updated_at: new Date().toISOString(),
    })
    .eq('gym_id', gid)
    .eq('gym_code_id', branchId)
    .eq('id', safeId)
    .select('*')
    .single();

  if (error) {
    await deleteMemberPhotoObject(storagePath).catch(() => {});
    rethrowPaymentQrDbError(error);
  }

  if (previousPath && previousPath !== storagePath) {
    await deleteMemberPhotoObject(previousPath).catch(() => {});
  }

  const [item] = await enrichPaymentQrRows([data], { signImages: true });
  return { item, photoUrl: item?.qrImageUrl || null };
}
