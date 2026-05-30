import { T } from '../../db/tables.js';

/** Cached: members.photo_path exists (migration supabase_member_photo_storage.sql). */
let memberPhotoStorageColumns;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @returns {Promise<boolean>}
 */
export async function memberPhotosStorageReady(sb) {
  if (memberPhotoStorageColumns !== undefined) return memberPhotoStorageColumns;
  const { error } = await sb.from(T.members).select('photo_path, photo_version').limit(0);
  const missing = error && String(error.message || '').includes('photo_path');
  memberPhotoStorageColumns = !missing;
  if (missing) {
    console.warn(
      '[apg] members.photo_path missing — run backend/migrations/supabase_member_photo_storage.sql. Member photo storage disabled until then.',
    );
  }
  return memberPhotoStorageColumns;
}

export function resetMemberPhotoSchemaCacheForTests() {
  memberPhotoStorageColumns = undefined;
}
