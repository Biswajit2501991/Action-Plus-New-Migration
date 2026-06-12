import { T } from '../../db/tables.js';
import { getSupabase, gymId } from '../../db/supabase/client.js';
import { notifyCollectionChange } from '../../realtime/supabaseListener.js';
import { staffRowToApp } from '../../db/supabase/mappers.js';
import {
  MEMBER_PHOTO_ALLOWED_MIMES,
  MEMBER_PHOTO_MAX_BYTES,
  MEMBER_PHOTO_MAX_MB,
  buildStaffPhotoStoragePath,
  memberPhotoStorageEnabled,
  mimeToExtension,
} from '../memberPhoto/storageConstants.js';
import { staffPhotosStorageReady } from './staffPhotoSchema.js';
import {
  createMemberPhotoSignedUrl,
  deleteMemberPhotoObject,
  uploadMemberPhotoObject,
} from '../memberPhoto/MemberPhotoStorageManager.js';

function parseImagePayload(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const match = raw.match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  if (match) {
    return { mime: match[1].toLowerCase(), buffer: Buffer.from(match[2], 'base64') };
  }
  try {
    return { mime: 'image/jpeg', buffer: Buffer.from(raw, 'base64') };
  } catch {
    return null;
  }
}

function actorLabel(auth) {
  return String(auth?.name || auth?.userId || 'system').trim() || 'system';
}

async function fetchStaffRow(staffLoginId) {
  const sb = getSupabase();
  const gid = gymId();
  const login = String(staffLoginId || '').trim();
  if (!login) return null;
  const { data: rows, error } = await sb
    .from(T.staff_users)
    .select('*')
    .eq('gym_id', gid)
    .eq('staff_login_id', login)
    .limit(1);
  if (error) throw new Error(`staff lookup: ${error.message}`);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function assertStaffPhotoStorageReady() {
  if (!memberPhotoStorageEnabled()) {
    const err = new Error('staff-photo-storage-disabled');
    err.status = 503;
    throw err;
  }
  const sb = getSupabase();
  const ready = await staffPhotosStorageReady(sb);
  if (!ready) {
    const err = new Error('staff-photo-schema-missing');
    err.status = 503;
    throw err;
  }
}

export function staffPhotoMetaFromRow(row) {
  const path = String(row?.photo_path || '').trim();
  const legacy = String(row?.photo_url || '').trim();
  return {
    photoVersion: Number(row?.photo_version || 0),
    hasPhoto: Boolean(path || legacy),
  };
}

export async function enrichStaffUserWithPhotoUrl(user, dbRow = null) {
  if (!user || typeof user !== 'object') return user;
  if (!memberPhotoStorageEnabled()) return user;

  const row = dbRow || null;
  const path = String(row?.photo_path || '').trim();
  const legacy = String(row?.photo_url || '').trim();
  const version = Number(row?.photo_version ?? user.photoVersion ?? 0);
  const hasPhoto = Boolean(path || legacy || user.hasPhoto);

  if (path) {
    const signed = await createMemberPhotoSignedUrl(path);
    return { ...user, photo: signed || '', photoVersion: version, hasPhoto: true };
  }
  if (legacy) {
    return { ...user, photo: legacy, photoVersion: version, hasPhoto: true };
  }
  return { ...user, photo: '', photoVersion: version, hasPhoto: false };
}

/** @param {object[]} users app-shaped staff users */
export async function enrichStaffUsersWithPhotoUrls(users, dbRows = []) {
  if (!memberPhotoStorageEnabled() || !Array.isArray(users) || !users.length) return users;
  const rowByLogin = new Map((dbRows || []).map((r) => [String(r.staff_login_id || '').trim(), r]));
  return Promise.all(users.map((u) => enrichStaffUserWithPhotoUrl(u, rowByLogin.get(String(u.id || '').trim()) || null)));
}

export async function uploadStaffPhoto(auth, staffLoginId, imagePayload) {
  await assertStaffPhotoStorageReady();
  const parsed = parseImagePayload(imagePayload);
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

  const row = await fetchStaffRow(staffLoginId);
  if (!row) {
    const err = new Error('staff-not-found');
    err.status = 404;
    throw err;
  }

  const gid = gymId();
  const login = String(staffLoginId).trim();
  const prevPath = String(row.photo_path || '').trim();
  const prevVersion = Number(row.photo_version || 0);
  const nextVersion = prevVersion + 1;
  const ext = mimeToExtension(parsed.mime);
  const storagePath = buildStaffPhotoStoragePath(gid, login, nextVersion, ext);
  const now = new Date().toISOString();
  const uploadedBy = actorLabel(auth);

  await uploadMemberPhotoObject(storagePath, parsed.buffer, parsed.mime);

  const sb = getSupabase();
  const { error: updErr } = await sb
    .from(T.staff_users)
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
    throw new Error(`staff photo update: ${updErr.message}`);
  }

  if (prevPath && prevPath !== storagePath) {
    await deleteMemberPhotoObject(prevPath).catch(() => {});
  }

  notifyCollectionChange('users');
  const refreshed = await fetchStaffRow(login);
  const appUser = staffRowToApp(refreshed, [], {}, refreshed.gym_code_id ? [String(refreshed.gym_code_id)] : []);
  const enriched = await enrichStaffUserWithPhotoUrl({
    ...appUser,
    photoVersion: nextVersion,
    hasPhoto: true,
  });
  return {
    user: enriched,
    photoUrl: enriched.photo,
    photoVersion: nextVersion,
    storagePath,
  };
}

export async function deleteStaffPhoto(auth, staffLoginId) {
  await assertStaffPhotoStorageReady();
  const row = await fetchStaffRow(staffLoginId);
  if (!row) {
    const err = new Error('staff-not-found');
    err.status = 404;
    throw err;
  }
  const prevPath = String(row.photo_path || '').trim();
  const now = new Date().toISOString();
  const uploadedBy = actorLabel(auth);

  const sb = getSupabase();
  const { error: updErr } = await sb
    .from(T.staff_users)
    .update({
      photo_path: null,
      photo_url: null,
      photo_uploaded_at: now,
      photo_uploaded_by: uploadedBy,
      updated_at: now,
      updated_by: uploadedBy,
    })
    .eq('id', row.id);
  if (updErr) throw new Error(`staff photo delete: ${updErr.message}`);

  if (prevPath) await deleteMemberPhotoObject(prevPath).catch(() => {});
  notifyCollectionChange('users');

  const refreshed = await fetchStaffRow(String(staffLoginId).trim());
  const appUser = staffRowToApp(refreshed, [], {}, refreshed?.gym_code_id ? [String(refreshed.gym_code_id)] : []);
  return enrichStaffUserWithPhotoUrl({ ...appUser, ...staffPhotoMetaFromRow(refreshed) });
}
