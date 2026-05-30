import { applyBatchPhotoUrls } from './photoUrlCache.js';

export function memberPhotoStorageEnabled() {
  try {
    return Boolean(window.__APG_ENV__?.MEMBER_PHOTO_STORAGE_ENABLED);
  } catch {
    return false;
  }
}

/**
 * @param {string} memberId
 * @param {string} imageDataUrl compressed data URL from client
 * @param {(path: string, init?: object) => Promise<any>} backendJson
 */
export async function uploadMemberPhotoApi(memberId, imageDataUrl, backendJson) {
  const id = String(memberId || '').trim();
  if (!id || !imageDataUrl) throw new Error('member-photo-args-required');
  return backendJson(`/members/${encodeURIComponent(id)}/photo`, {
    method: 'POST',
    body: JSON.stringify({ image: imageDataUrl }),
  });
}

export async function deleteMemberPhotoApi(memberId, backendJson) {
  const id = String(memberId || '').trim();
  if (!id) throw new Error('member-id-required');
  return backendJson(`/members/${encodeURIComponent(id)}/photo`, { method: 'DELETE' });
}

/**
 * @param {string[]} memberIds
 * @param {(path: string, init?: object) => Promise<any>} backendJson
 */
export async function batchFetchMemberPhotoUrls(memberIds, backendJson) {
  const ids = [...new Set((memberIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (!ids.length) return [];
  const res = await backendJson('/members/photo-urls', {
    method: 'POST',
    body: JSON.stringify({ memberIds: ids }),
  });
  const rows = Array.isArray(res?.urls) ? res.urls : [];
  applyBatchPhotoUrls(rows);
  return rows;
}
