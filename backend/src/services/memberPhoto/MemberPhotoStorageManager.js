import { getSupabase } from '../../db/supabase/client.js';
import {
  MEMBER_PHOTO_BUCKET,
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
      fileSizeLimit: 5 * 1024 * 1024,
    });
    if (error && !String(error.message || '').includes('already exists')) {
      throw new Error(`storage bucket create: ${error.message}`);
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
  await ensureMemberPhotoBucket();
  const sb = getSupabase();
  const { data, error } = await sb.storage.from(MEMBER_PHOTO_BUCKET).createSignedUrl(storagePath, expiresIn);
  if (error) throw new Error(`signed url: ${error.message}`);
  return data?.signedUrl || null;
}

export function buildPathForMember(gymId, memberCode, version, mime) {
  return buildMemberPhotoStoragePath(gymId, memberCode, version, mimeToExtension(mime));
}

export function resetBucketEnsuredForTests() {
  bucketEnsured = false;
}
