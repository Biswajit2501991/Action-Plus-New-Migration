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
  for (const row of rows) {
    const memberId = String(row?.memberId || '').trim();
    if (!memberId || !row?.url) continue;
    setCachedMemberPhotoUrl(memberId, row.photoVersion, row.url);
  }
}

/** Member IDs that need a batch URL fetch (hasPhoto, no valid cache). */
export function memberIdsNeedingPhotoUrls(members = [], limit = 50) {
  const out = [];
  for (const m of members) {
    if (!m?.hasPhoto) continue;
    const id = String(m.memberId || '').trim();
    if (!id) continue;
    const version = Number(m.photoVersion || 0);
    if (getCachedMemberPhotoUrl(id, version)) continue;
    const inline = String(m.photo || '').trim();
    if (inline.startsWith('data:')) continue;
    if (inline.startsWith('http') && version === 0) continue;
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}
