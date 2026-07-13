import type { Member } from "@/types";
import {
  applyBatchPhotoUrls,
  getCachedMemberPhotoUrl,
} from "@/lib/domain/member-photo-cache";

/** Keep in sync with backend MEMBER_PHOTO_BATCH_MAX. */
export const MEMBER_PHOTO_BATCH_MAX = 100;
export const MEMBER_PHOTO_PARALLEL_BATCHES = 2;

export function memberHasStoredPhoto(member?: Member | null) {
  if (!member) return false;
  const version = Number(member.photoVersion || 0);
  return Boolean(member.hasPhoto || version > 0);
}

export function resolveMemberAvatarSrc(member?: Member | null) {
  if (!member) return "";
  const inline = String(member.photo || member.photoUrl || "").trim();
  // Fresh client drafts always win over cached signed URLs.
  if (inline.startsWith("data:")) return inline;

  const version = Number(member.photoVersion || 0);
  const id = String(member.memberId || "").trim();

  if (id && memberHasStoredPhoto(member)) {
    const cached = getCachedMemberPhotoUrl(id, version);
    if (cached) return cached;
    // Legacy photo_url rows (version 0) — no signed URL batch needed.
    if (inline.startsWith("http") && version === 0) return inline;
    if (inline.startsWith("http")) return inline;
    return "";
  }

  return inline;
}

export function memberNeedsPhotoUrl(member?: Member | null) {
  const id = String(member?.memberId || "").trim();
  if (!id) return false;
  if (!memberHasStoredPhoto(member)) return false;
  const version = Number(member?.photoVersion || 0);
  if (getCachedMemberPhotoUrl(id, version)) return false;
  const inline = String(member?.photo || member?.photoUrl || "").trim();
  if (inline.startsWith("data:")) return false;
  if (inline.startsWith("http") && version === 0) return false;
  return true;
}

export function memberIdsNeedingPhotoUrls(members: Member[] = []) {
  const out: string[] = [];
  for (const m of members) {
    if (!memberNeedsPhotoUrl(m)) continue;
    out.push(String(m.memberId).trim());
  }
  return out;
}

export function chunkMemberIds(ids: string[], size = MEMBER_PHOTO_BATCH_MAX) {
  const list = Array.isArray(ids) ? ids : [];
  const chunks: string[][] = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
}

export type PhotoUrlRow = {
  memberId?: string;
  photoVersion?: number;
  url?: string;
  hasPhoto?: boolean;
};

/**
 * Fetch signed URLs for members that need them (prod list-avatar hydrate).
 * Priority IDs (visible page) load first; remaining chunks run in parallel waves.
 */
export async function syncMemberPhotoUrls(
  members: Member[],
  fetchBatch: (memberIds: string[]) => Promise<{ urls?: PhotoUrlRow[] }>,
  options: { priorityIds?: string[] } = {},
) {
  const priority = new Set(
    (options.priorityIds || []).map((id) => String(id || "").trim()).filter(Boolean),
  );
  const needAll = memberIdsNeedingPhotoUrls(members);
  if (!needAll.length) return { fetched: 0, batches: 0 };

  const sorted = [
    ...needAll.filter((id) => priority.has(id)),
    ...needAll.filter((id) => !priority.has(id)),
  ];
  const chunks = chunkMemberIds(sorted, MEMBER_PHOTO_BATCH_MAX);
  let fetched = 0;
  let batches = 0;

  const runChunk = async (chunk: string[]) => {
    const res = await fetchBatch(chunk);
    const rows = Array.isArray(res?.urls) ? res.urls : [];
    applyBatchPhotoUrls(rows);
    fetched += rows.length;
    batches += 1;
  };

  const first = chunks.shift();
  if (first?.length) await runChunk(first);

  while (chunks.length) {
    const wave = chunks.splice(0, MEMBER_PHOTO_PARALLEL_BATCHES);
    await Promise.all(wave.filter((c) => c.length).map(runChunk));
  }

  return { fetched, batches };
}
