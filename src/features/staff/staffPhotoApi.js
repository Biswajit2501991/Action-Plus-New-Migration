import { applyBatchPhotoUrls, getCachedMemberPhotoUrl } from '../members/photoUrlCache.js';

/** Reuses member photo storage flag — same Supabase bucket and env toggle. */
export function staffPhotoStorageEnabled() {
  try {
    return Boolean(window.__APG_ENV__?.MEMBER_PHOTO_STORAGE_ENABLED);
  } catch {
    return false;
  }
}

const STAFF_PHOTO_BATCH_MAX = 100;

function staffNeedsPhotoUrl(user) {
  if (!user?.hasPhoto) return false;
  const id = String(user.id || '').trim();
  if (!id) return false;
  const version = Number(user.photoVersion || 0);
  if (getCachedMemberPhotoUrl(id, version)) return false;
  const inline = String(user.photo || user.avatar || '').trim();
  if (inline.startsWith('data:')) return false;
  if (inline.startsWith('http') && version === 0) return false;
  return true;
}

export function staffIdsNeedingPhotoUrlsAll(users = []) {
  const out = [];
  for (const u of users) {
    if (!staffNeedsPhotoUrl(u)) continue;
    out.push(String(u.id).trim());
  }
  return out;
}

export async function batchFetchStaffPhotoUrls(staffIds, backendJson) {
  const ids = [...new Set((staffIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (!ids.length) return [];
  const res = await backendJson('/users/photo-urls', {
    method: 'POST',
    body: JSON.stringify({ staffIds: ids }),
  });
  const rows = Array.isArray(res?.urls) ? res.urls : [];
  applyBatchPhotoUrls(rows.map((row) => ({
    memberId: row.staffId || row.id,
    photoVersion: row.photoVersion,
    url: row.url,
  })));
  return rows;
}

export async function syncAllStaffPhotoUrls(users, backendJson) {
  if (!staffPhotoStorageEnabled()) return { fetched: 0, batches: 0 };
  const needAll = staffIdsNeedingPhotoUrlsAll(users);
  if (!needAll.length) return { fetched: 0, batches: 0 };
  const chunks = [];
  for (let i = 0; i < needAll.length; i += STAFF_PHOTO_BATCH_MAX) {
    chunks.push(needAll.slice(i, i + STAFF_PHOTO_BATCH_MAX));
  }
  let fetched = 0;
  for (const chunk of chunks) {
    const rows = await batchFetchStaffPhotoUrls(chunk, backendJson);
    fetched += rows.length;
  }
  return { fetched, batches: chunks.length };
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
