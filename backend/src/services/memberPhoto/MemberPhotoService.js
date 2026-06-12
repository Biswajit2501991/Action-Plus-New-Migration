import { T } from '../../db/tables.js';
import { getSupabase, gymId } from '../../db/supabase/client.js';
import { notifyCollectionChange } from '../../realtime/supabaseListener.js';
import { readMemberByCode } from '../../db/supabase/repository.js';
import {
  MEMBER_PHOTO_ALLOWED_MIMES,
  MEMBER_PHOTO_BATCH_MAX,
  MEMBER_PHOTO_MAX_BYTES,
  MEMBER_PHOTO_MAX_MB,
  memberPhotoStorageEnabled,
} from './storageConstants.js';
import { memberPhotosStorageReady } from './memberPhotoSchema.js';
import {
  buildPathForMember,
  createMemberPhotoSignedUrl,
  createMemberPhotoSignedUrlsBatch,
  deleteMemberPhotoObject,
  uploadMemberPhotoObject,
} from './MemberPhotoStorageManager.js';

import { parseMemberPhotoImagePayload } from './parseImagePayload.js';

function actorLabel(auth) {
  return String(auth?.name || auth?.userId || 'system').trim() || 'system';
}

async function fetchMemberRow(memberCode, branchScope) {
  const sb = getSupabase();
  const gid = gymId();
  const code = String(memberCode || '').trim();
  if (!code) return null;
  let q = sb.from(T.members).select('*').eq('gym_id', gid).eq('member_code', code);
  if (branchScope?.gymCodeId && !branchScope?.isOwner) {
    q = q.eq('assigned_gym_code_id', branchScope.gymCodeId);
  }
  const { data: rows, error } = await q.order('updated_at', { ascending: false }).limit(1);
  if (error) throw new Error(`member lookup: ${error.message}`);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export function memberPhotoMetaFromRow(row) {
  const path = String(row?.photo_path || '').trim();
  const legacy = String(row?.photo_url || '').trim();
  return {
    photoVersion: Number(row?.photo_version || 0),
    hasPhoto: Boolean(path || legacy),
  };
}

/** Resolve photo URL from an already-loaded DB row (avoids extra query on detail GET). */
export async function enrichMemberPhotoFromDbRow(member, dbRow) {
  if (!member || typeof member !== 'object') return member;
  if (!memberPhotoStorageEnabled()) return member;

  const path = String(dbRow?.photo_path || '').trim();
  const legacy = String(dbRow?.photo_url || '').trim();
  const version = Number(dbRow?.photo_version ?? member.photoVersion ?? 0);
  const hasPhoto = Boolean(path || legacy || member.hasPhoto);

  if (path) {
    const signed = await createMemberPhotoSignedUrl(path);
    return { ...member, photo: signed || '', photoVersion: version, hasPhoto: true };
  }
  if (legacy) {
    return { ...member, photo: legacy, photoVersion: version, hasPhoto: true };
  }
  return { ...member, photo: '', photoVersion: version, hasPhoto: false };
}

/** Resolve display URL for one member (detail views). Falls back to DB lookup when row not provided. */
export async function enrichMemberWithPhotoUrl(member, dbRow = null) {
  if (!member || typeof member !== 'object') return member;
  if (!memberPhotoStorageEnabled()) return member;
  if (dbRow) return enrichMemberPhotoFromDbRow(member, dbRow);

  const code = String(member.memberId || '').trim();
  if (!code) return member;

  const sb = getSupabase();
  const gid = gymId();
  const { data, error } = await sb
    .from(T.members)
    .select('photo_path, photo_url, photo_version')
    .eq('gym_id', gid)
    .eq('member_code', code)
    .maybeSingle();
  if (error) throw new Error(`photo enrich lookup: ${error.message}`);
  return enrichMemberPhotoFromDbRow(member, data || {});
}

export async function assertMemberPhotoStorageReady() {
  if (!memberPhotoStorageEnabled()) {
    const err = new Error('member-photo-storage-disabled');
    err.status = 503;
    throw err;
  }
  const sb = getSupabase();
  const ready = await memberPhotosStorageReady(sb);
  if (!ready) {
    const err = new Error('member-photo-schema-missing');
    err.status = 503;
    throw err;
  }
}

/**
 * Upload or replace member profile photo.
 * @returns {Promise<{ member: object, photoUrl: string, photoVersion: number }>}
 */
export async function uploadMemberPhoto(auth, memberCode, imagePayload, branchScope) {
  await assertMemberPhotoStorageReady();
  const parsed = parseMemberPhotoImagePayload(imagePayload);
  if (!parsed?.buffer?.length) {
    const err = new Error('photo-data-required');
    err.status = 400;
    throw err;
  }
  if (!MEMBER_PHOTO_ALLOWED_MIMES.has(parsed.mime)) {
    const err = new Error('photo-mime-invalid');
    err.status = 400;
    throw err;
  }
  if (parsed.buffer.length > MEMBER_PHOTO_MAX_BYTES) {
    const err = new Error('photo-too-large');
    err.status = 400;
    err.detail = { maxBytes: MEMBER_PHOTO_MAX_BYTES, maxMb: MEMBER_PHOTO_MAX_MB };
    throw err;
  }

  const row = await fetchMemberRow(memberCode, branchScope);
  if (!row) {
    const err = new Error('member-not-found');
    err.status = 404;
    throw err;
  }

  const gid = gymId();
  const code = String(memberCode).trim();
  const prevPath = String(row.photo_path || '').trim();
  const prevVersion = Number(row.photo_version || 0);
  const nextVersion = prevVersion + 1;
  const storagePath = buildPathForMember(gid, code, nextVersion, parsed.mime);
  const now = new Date().toISOString();
  const uploadedBy = actorLabel(auth);

  await uploadMemberPhotoObject(storagePath, parsed.buffer, parsed.mime);

  const sb = getSupabase();
  const { error: updErr } = await sb
    .from(T.members)
    .update({
      photo_path: storagePath,
      photo_version: nextVersion,
      photo_uploaded_at: now,
      photo_uploaded_by: uploadedBy,
      photo_url: null,
      updated_at: now,
      updated_by: uploadedBy,
    })
    .eq('id', row.id);
  if (updErr) {
    await deleteMemberPhotoObject(storagePath).catch(() => {});
    throw new Error(`member photo update: ${updErr.message}`);
  }

  if (prevPath && prevPath !== storagePath) {
    await deleteMemberPhotoObject(prevPath).catch(() => {});
  }

  notifyCollectionChange('members');
  const appMember = await readMemberByCode(code, branchScope);
  const enriched = await enrichMemberWithPhotoUrl({
    ...(appMember || {}),
    photoVersion: nextVersion,
    hasPhoto: true,
  });
  return {
    member: enriched,
    photoUrl: enriched.photo,
    photoVersion: nextVersion,
    previousPath: prevPath || null,
    storagePath,
  };
}

export async function deleteMemberPhoto(auth, memberCode, branchScope) {
  await assertMemberPhotoStorageReady();
  const row = await fetchMemberRow(memberCode, branchScope);
  if (!row) {
    const err = new Error('member-not-found');
    err.status = 404;
    throw err;
  }
  const prevPath = String(row.photo_path || '').trim();
  const now = new Date().toISOString();
  const uploadedBy = actorLabel(auth);

  const sb = getSupabase();
  const { error: updErr } = await sb
    .from(T.members)
    .update({
      photo_path: null,
      photo_url: null,
      photo_uploaded_at: now,
      photo_uploaded_by: uploadedBy,
      updated_at: now,
      updated_by: uploadedBy,
    })
    .eq('id', row.id);
  if (updErr) throw new Error(`member photo delete: ${updErr.message}`);

  if (prevPath) await deleteMemberPhotoObject(prevPath).catch(() => {});
  notifyCollectionChange('members');

  const appMember = await readMemberByCode(String(memberCode).trim(), branchScope);
  const refreshed = await fetchMemberRow(String(memberCode).trim(), branchScope);
  return enrichMemberWithPhotoUrl({ ...(appMember || {}), ...memberPhotoMetaFromRow(refreshed) });
}

/**
 * Batch signed URLs for list views (Option A).
 * @param {string[]} memberCodes
 */
export async function batchMemberPhotoSignedUrls(auth, memberCodes, branchScope) {
  await assertMemberPhotoStorageReady();
  const codes = [...new Set((memberCodes || []).map((c) => String(c || '').trim()).filter(Boolean))];
  if (!codes.length) return { urls: [] };
  if (codes.length > MEMBER_PHOTO_BATCH_MAX) {
    const err = new Error('photo-batch-too-large');
    err.status = 400;
    err.detail = { max: MEMBER_PHOTO_BATCH_MAX, got: codes.length };
    throw err;
  }

  const sb = getSupabase();
  const gid = gymId();
  let q = sb
    .from(T.members)
    .select('member_code, photo_path, photo_version, photo_url, assigned_gym_code_id')
    .eq('gym_id', gid)
    .in('member_code', codes);
  if (branchScope?.gymCodeId && !branchScope?.isOwner) {
    q = q.eq('assigned_gym_code_id', branchScope.gymCodeId);
  }
  const { data: rows, error } = await q;
  if (error) throw new Error(`photo batch lookup: ${error.message}`);

  const storageItems = [];
  const urls = [];

  for (const row of rows || []) {
    const memberId = String(row.member_code || '').trim();
    const version = Number(row.photo_version || 0);
    const path = String(row.photo_path || '').trim();
    if (path) {
      storageItems.push({ memberId, version, path });
      continue;
    }
    const legacy = String(row.photo_url || '').trim();
    if (legacy) {
      urls.push({ memberId, photoVersion: version, url: legacy, hasPhoto: true });
    }
  }

  if (storageItems.length) {
    const pathList = storageItems.map((x) => x.path);
    const signedMap = await createMemberPhotoSignedUrlsBatch(pathList);
    for (const item of storageItems) {
      const url = signedMap.get(item.path) || '';
      if (!url) continue;
      urls.push({
        memberId: item.memberId,
        photoVersion: item.version,
        url,
        hasPhoto: true,
      });
    }
  }

  return { urls };
}

/**
 * Migrate one member legacy data URL → storage (background job).
 */
export async function migrateLegacyMemberPhoto(memberCode) {
  await assertMemberPhotoStorageReady();
  const sb = getSupabase();
  const gid = gymId();
  const code = String(memberCode || '').trim();
  const { data: rows, error } = await sb
    .from(T.members)
    .select('*')
    .eq('gym_id', gid)
    .eq('member_code', code)
    .limit(1);
  if (error) throw new Error(error.message);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row) return { skipped: true, reason: 'not-found' };
  if (String(row.photo_path || '').trim()) return { skipped: true, reason: 'already-migrated' };
  const legacy = String(row.photo_url || '').trim();
  if (!legacy.startsWith('data:image/')) return { skipped: true, reason: 'no-legacy-photo' };

  const result = await uploadMemberPhoto(
    { userId: 'migration', name: 'photo-migration' },
    code,
    legacy,
    { isOwner: true, gymCodeId: null },
  );
  return { migrated: true, memberId: code, photoVersion: result.photoVersion };
}
