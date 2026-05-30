/** In-memory signed URL cache keyed by memberId + photoVersion. */
const cache = new Map();

export function memberPhotoCacheKey(memberId, photoVersion) {
  return `${String(memberId || '').trim()}::${Number(photoVersion || 0)}`;
}

export function getCachedMemberPhotoUrl(memberId, photoVersion) {
  const hit = cache.get(memberPhotoCacheKey(memberId, photoVersion));
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(memberPhotoCacheKey(memberId, photoVersion));
    return null;
  }
  return hit.url;
}

export function setCachedMemberPhotoUrl(memberId, photoVersion, url, ttlMs = 50 * 60 * 1000) {
  const key = memberPhotoCacheKey(memberId, photoVersion);
  if (!url) {
    cache.delete(key);
    return;
  }
  cache.set(key, { url: String(url), expiresAt: Date.now() + ttlMs });
}

export function invalidateMemberPhotoCache(memberId) {
  const id = String(memberId || '').trim();
  if (!id) return;
  for (const key of cache.keys()) {
    if (key.startsWith(`${id}::`)) cache.delete(key);
  }
}

export function clearMemberPhotoCache() {
  cache.clear();
}

export function applyBatchPhotoUrls(rows = []) {
  let changed = false;
  for (const row of rows) {
    const memberId = String(row?.memberId || '').trim();
    if (!memberId || !row?.url) continue;
    setCachedMemberPhotoUrl(memberId, row.photoVersion, row.url);
    changed = true;
  }
  if (changed && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('apg:photo-cache-updated'));
  }
}
