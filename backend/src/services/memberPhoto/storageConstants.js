/** Private Supabase Storage bucket for gym media (members, future staff/docs). */
export const MEMBER_PHOTO_BUCKET = process.env.APG_MEDIA_BUCKET || 'apg-media';

export const MEMBER_PHOTO_MAX_BYTES = Number(process.env.MEMBER_PHOTO_MAX_BYTES || 5 * 1024 * 1024);

export const MEMBER_PHOTO_SIGNED_URL_TTL_SEC = Number(process.env.MEMBER_PHOTO_SIGNED_URL_TTL_SEC || 3600);

export const MEMBER_PHOTO_BATCH_MAX = 50;

export const MEMBER_PHOTO_ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function memberPhotoStorageEnabled() {
  const v = process.env.MEMBER_PHOTO_STORAGE_ENABLED;
  return v === 'true' || v === '1';
}

/** Safe storage key segment from member_code (may contain slashes). */
export function sanitizeMemberCodeForPath(memberCode) {
  return String(memberCode || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 120) || 'unknown';
}

export function buildMemberPhotoStoragePath(gymId, memberCode, version, ext = 'jpg') {
  const safe = sanitizeMemberCodeForPath(memberCode);
  const v = Math.max(1, Number(version) || 1);
  return `gyms/${String(gymId).trim()}/members/${safe}/profile/v${v}.${ext}`;
}

export function mimeToExtension(mime) {
  const m = String(mime || '').toLowerCase();
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  return 'jpg';
}
