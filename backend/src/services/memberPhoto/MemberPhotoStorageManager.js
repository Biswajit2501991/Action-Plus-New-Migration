import { getSupabase } from '../../db/supabase/client.js';
import {
  MEMBER_PHOTO_BUCKET,
  MEMBER_PHOTO_MAX_BYTES,
  MEMBER_PHOTO_SIGNED_URL_TTL_SEC,
  buildMemberPhotoStoragePath,
  mimeToExtension,
} from './storageConstants.js';

let bucketEnsured = false;

export async function ensureMemberPhotoBucket() {
  if (bucketEnsured) return;
  const sb = getSupabase();
  const { data } = await sb.storage.getBucket(MEMBER_PHOTO_BUCKET);
  if (!data) {
    const { error } = await sb.storage.createBucket(MEMBER_PHOTO_BUCKET, {
      public: false,
      fileSizeLimit: MEMBER_PHOTO_MAX_BYTES,
    });
    if (error && !String(error.message || '').includes('already exists')) {
      throw new Error(`storage bucket create: ${error.message}`);
    }
  } else if (typeof sb.storage.updateBucket === 'function') {
    const { error } = await sb.storage.updateBucket(MEMBER_PHOTO_BUCKET, {
      fileSizeLimit: MEMBER_PHOTO_MAX_BYTES,
    });
    if (error && !String(error.message || '').includes('not found')) {
      console.warn(`[member-photo] bucket fileSizeLimit update: ${error.message}`);
    }
  }
  bucketEnsured = true;
}

/**
 * @param {string} storagePath
 * @param {Buffer} buffer
 * @param {string} contentType
 */
export async function uploadMemberPhotoObject(storagePath, buffer, contentType) {
  await ensureMemberPhotoBucket();
  const sb = getSupabase();
  const { error } = await sb.storage.from(MEMBER_PHOTO_BUCKET).upload(storagePath, buffer, {
    contentType,
    upsert: true,
    cacheControl: '3600',
  });
  if (error) throw new Error(`storage upload: ${error.message}`);
  return storagePath;
}

/** @param {string} storagePath */
export async function deleteMemberPhotoObject(storagePath) {
  if (!storagePath) return;
  await ensureMemberPhotoBucket();
  const sb = getSupabase();
  const { error } = await sb.storage.from(MEMBER_PHOTO_BUCKET).remove([storagePath]);
  if (error) throw new Error(`storage delete: ${error.message}`);
}

/** @param {string} storagePath */
export async function createMemberPhotoSignedUrl(storagePath, expiresIn = MEMBER_PHOTO_SIGNED_URL_TTL_SEC) {
  if (!storagePath) return null;
  const map = await createMemberPhotoSignedUrlsBatch([storagePath], expiresIn);
  return map.get(storagePath) || null;
}

/**
 * Sign many storage paths in one Supabase Storage call (falls back to parallel singles).
 * @param {string[]} storagePaths
 * @returns {Promise<Map<string, string>>} path → signedUrl
 */
export async function createMemberPhotoSignedUrlsBatch(
  storagePaths,
  expiresIn = MEMBER_PHOTO_SIGNED_URL_TTL_SEC,
) {
  const unique = [...new Set((storagePaths || []).map((p) => String(p || '').trim()).filter(Boolean))];
  const map = new Map();
  if (!unique.length) return map;

  await ensureMemberPhotoBucket();
  const sb = getSupabase();
  const bucket = sb.storage.from(MEMBER_PHOTO_BUCKET);

  if (typeof bucket.createSignedUrls === 'function') {
    const { data, error } = await bucket.createSignedUrls(unique, expiresIn);
    if (error) throw new Error(`signed urls batch: ${error.message}`);
    for (const item of data || []) {
      const path = String(item?.path || '').trim();
      const url = String(item?.signedUrl || '').trim();
      if (path && url) map.set(path, url);
    }
    return map;
  }

  await Promise.all(unique.map(async (path) => {
    const { data, error } = await bucket.createSignedUrl(path, expiresIn);
    if (error) throw new Error(`signed url: ${error.message}`);
    if (data?.signedUrl) map.set(path, data.signedUrl);
  }));
  return map;
}

export function buildPathForMember(gymId, memberCode, version, mime) {
  return buildMemberPhotoStoragePath(gymId, memberCode, version, mimeToExtension(mime));
}

export function resetBucketEnsuredForTests() {
  bucketEnsured = false;
}
