/** In-memory signed URL cache keyed by memberId + photoVersion. */

type CacheEntry = { url: string; expiresAt: number };

const cache = new Map<string, CacheEntry>();

export const MEMBER_PHOTO_CACHE_EVENT = "apg:photo-cache-updated";

export function memberPhotoCacheKey(memberId: string, photoVersion?: number) {
  return `${String(memberId || "").trim()}::${Number(photoVersion || 0)}`;
}

export function getCachedMemberPhotoUrl(memberId: string, photoVersion?: number) {
  const key = memberPhotoCacheKey(memberId, photoVersion);
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.url;
}

export function setCachedMemberPhotoUrl(
  memberId: string,
  photoVersion: number | undefined,
  url: string,
  ttlMs = 50 * 60 * 1000,
) {
  const key = memberPhotoCacheKey(memberId, photoVersion);
  if (!url) {
    cache.delete(key);
    return;
  }
  cache.set(key, { url: String(url), expiresAt: Date.now() + ttlMs });
}

export function invalidateMemberPhotoCache(memberId: string) {
  const id = String(memberId || "").trim();
  if (!id) return;
  for (const key of cache.keys()) {
    if (key.startsWith(`${id}::`)) cache.delete(key);
  }
}

export function applyBatchPhotoUrls(
  rows: Array<{ memberId?: string; photoVersion?: number; url?: string }> = [],
) {
  let changed = false;
  for (const row of rows) {
    const memberId = String(row?.memberId || "").trim();
    if (!memberId || !row?.url) continue;
    setCachedMemberPhotoUrl(memberId, row.photoVersion, row.url);
    changed = true;
  }
  if (changed && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(MEMBER_PHOTO_CACHE_EVENT));
  }
  return changed;
}
