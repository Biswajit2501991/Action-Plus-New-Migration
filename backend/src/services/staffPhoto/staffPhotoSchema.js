import { T } from '../../db/tables.js';

/** Cached: staff_users.photo_path exists (migration supabase_staff_photo_storage.sql). */
let staffPhotoStorageColumns;

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @returns {Promise<boolean>}
 */
export async function staffPhotosStorageReady(sb) {
  if (staffPhotoStorageColumns !== undefined) return staffPhotoStorageColumns;
  const { error } = await sb.from(T.staff_users).select('photo_path, photo_version').limit(0);
  const missing = error && String(error.message || '').includes('photo_path');
  staffPhotoStorageColumns = !missing;
  if (missing) {
    console.warn(
      '[apg] staff_users.photo_path missing — run backend/migrations/supabase_staff_photo_storage.sql. Staff photo storage disabled until then.',
    );
  }
  return staffPhotoStorageColumns;
}

export function resetStaffPhotoSchemaCacheForTests() {
  staffPhotoStorageColumns = undefined;
}
