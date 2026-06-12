/** Reuses member photo storage flag — same Supabase bucket and env toggle. */
export function staffPhotoStorageEnabled() {
  try {
    return Boolean(window.__APG_ENV__?.MEMBER_PHOTO_STORAGE_ENABLED);
  } catch {
    return false;
  }
}

/**
 * @param {string} staffId
 * @param {string} imageDataUrl compressed data URL from client
 * @param {(path: string, init?: object) => Promise<any>} backendJson
 */
export async function uploadStaffPhotoApi(staffId, imageDataUrl, backendJson) {
  const id = String(staffId || '').trim();
  if (!id || !imageDataUrl) throw new Error('staff-photo-args-required');
  return backendJson(`/users/${encodeURIComponent(id)}/photo`, {
    method: 'POST',
    body: JSON.stringify({ image: imageDataUrl }),
  });
}

export async function deleteStaffPhotoApi(staffId, backendJson) {
  const id = String(staffId || '').trim();
  if (!id) throw new Error('staff-id-required');
  return backendJson(`/users/${encodeURIComponent(id)}/photo`, { method: 'DELETE' });
}
