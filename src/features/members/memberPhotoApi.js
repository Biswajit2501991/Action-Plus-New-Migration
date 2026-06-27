import { applyBatchPhotoUrls, getCachedMemberPhotoUrl } from './photoUrlCache.js';

/** Keep in sync with backend/src/services/memberPhoto/storageConstants.js (browser-safe copy). */
const MEMBER_PHOTO_BATCH_MAX = 100;
const MEMBER_PHOTO_PARALLEL_BATCHES = 2;

export function memberPhotoStorageEnabled() {
  try {
    return Boolean(window.__APG_ENV__?.MEMBER_PHOTO_STORAGE_ENABLED);
  } catch {
    return false;
  }
}

export function isMemberPhotoStorageActive() {
  return memberPhotoStorageEnabled();
}

function memberNeedsPhotoUrl(member) {
  const id = String(member?.memberId || '').trim();
  if (!id) return false;
  const version = Number(member?.photoVersion || 0);
  const hasPhoto = Boolean(member?.hasPhoto || version > 0);
  if (!hasPhoto) return false;
  if (getCachedMemberPhotoUrl(id, version)) return false;
  const inline = String(member?.photo || '').trim();
  if (inline.startsWith('data:')) return false;
  if (inline.startsWith('http') && version === 0) return false;
  return true;
}

/** All member IDs needing signed URLs, preserving list order (first rows = usually visible). */
export function memberIdsNeedingPhotoUrlsAll(members = []) {
  const out = [];
  for (const m of members) {
    if (!memberNeedsPhotoUrl(m)) continue;
    out.push(String(m.memberId).trim());
  }
  return out;
}

/** @deprecated use memberIdsNeedingPhotoUrlsAll with client-side chunking */
export function memberIdsNeedingPhotoUrls(members = [], limit = MEMBER_PHOTO_BATCH_MAX) {
  return memberIdsNeedingPhotoUrlsAll(members).slice(0, limit);
}

export function chunkMemberIds(ids, size = MEMBER_PHOTO_BATCH_MAX) {
  const list = Array.isArray(ids) ? ids : [];
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
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

/**
 * Fetch signed URLs for every member that needs one.
 * First chunk loads immediately (top of list); remaining chunks run in parallel waves.
 */
/** Hydrate/login hook — batch-fetch signed URLs for list avatars. */
export async function runMemberPhotoBatchSync(members, backendJson, options = {}) {
  if (!memberPhotoStorageEnabled() || typeof backendJson !== 'function') {
    return { fetched: 0, batches: 0, skipped: true };
  }
  return syncAllMemberPhotoUrls(members, backendJson, options);
}

export async function syncAllMemberPhotoUrls(members, backendJson, options = {}) {
  if (!memberPhotoStorageEnabled()) return { fetched: 0, batches: 0 };
  const priority = new Set((options.priorityIds || []).map((id) => String(id || '').trim()).filter(Boolean));
  const needAll = memberIdsNeedingPhotoUrlsAll(members);
  if (!needAll.length) return { fetched: 0, batches: 0 };

  const sorted = [
    ...needAll.filter((id) => priority.has(id)),
    ...needAll.filter((id) => !priority.has(id)),
  ];
  const chunks = chunkMemberIds(sorted, MEMBER_PHOTO_BATCH_MAX);
  let fetched = 0;
  let batches = 0;

  const runChunk = async (chunk) => {
    const rows = await batchFetchMemberPhotoUrls(chunk, backendJson);
    fetched += rows.length;
    batches += 1;
    return rows;
  };

  const first = chunks.shift();
  if (first?.length) await runChunk(first);

  const parallel = Math.max(1, MEMBER_PHOTO_PARALLEL_BATCHES);
  while (chunks.length) {
    const wave = chunks.splice(0, parallel);
    await Promise.all(wave.filter((c) => c.length).map(runChunk));
  }

  return { fetched, batches };
}
