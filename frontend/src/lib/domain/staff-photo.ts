import type { StaffUser } from "@/types";
import {
  applyBatchPhotoUrls,
  getCachedMemberPhotoUrl,
} from "@/lib/domain/member-photo-cache";

export const STAFF_PHOTO_BATCH_MAX = 100;

export function staffInitialsFromName(name?: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function staffHasStoredPhoto(user?: StaffUser | null) {
  if (!user) return false;
  const version = Number(user.photoVersion || 0);
  return Boolean(user.hasPhoto || version > 0);
}

/** Prod-style: cache → data URL → http inline → empty (initials). */
export function resolveStaffAvatarSrc(user?: StaffUser | null) {
  if (!user) return "";
  const inline = String(user.photo || user.photoUrl || user.avatar || "").trim();
  if (inline.startsWith("data:")) return inline;

  const version = Number(user.photoVersion || 0);
  const id = String(user.id || "").trim();

  if (id && staffHasStoredPhoto(user)) {
    const cached = getCachedMemberPhotoUrl(id, version);
    if (cached) return cached;
    if (inline.startsWith("http") && version === 0) return inline;
    if (inline.startsWith("http")) return inline;
    return "";
  }

  return inline;
}

export function staffNeedsPhotoUrl(user?: StaffUser | null) {
  const id = String(user?.id || "").trim();
  if (!id) return false;
  if (!staffHasStoredPhoto(user)) return false;
  const version = Number(user?.photoVersion || 0);
  if (getCachedMemberPhotoUrl(id, version)) return false;
  const inline = String(user?.photo || user?.photoUrl || user?.avatar || "").trim();
  if (inline.startsWith("data:")) return false;
  if (inline.startsWith("http") && version === 0) return false;
  return true;
}

export function staffIdsNeedingPhotoUrls(users: StaffUser[] = []) {
  const out: string[] = [];
  for (const u of users) {
    if (!staffNeedsPhotoUrl(u)) continue;
    out.push(String(u.id).trim());
  }
  return out;
}

export type StaffPhotoUrlRow = {
  staffId?: string;
  id?: string;
  photoVersion?: number;
  url?: string;
};

export async function syncStaffPhotoUrls(
  users: StaffUser[],
  fetchBatch: (staffIds: string[]) => Promise<{ urls?: StaffPhotoUrlRow[] }>,
) {
  const needAll = staffIdsNeedingPhotoUrls(users);
  if (!needAll.length) return { fetched: 0, batches: 0 };

  const chunks: string[][] = [];
  for (let i = 0; i < needAll.length; i += STAFF_PHOTO_BATCH_MAX) {
    chunks.push(needAll.slice(i, i + STAFF_PHOTO_BATCH_MAX));
  }

  let fetched = 0;
  for (const chunk of chunks) {
    const res = await fetchBatch(chunk);
    const rows = Array.isArray(res?.urls) ? res.urls : [];
    applyBatchPhotoUrls(
      rows.map((row) => ({
        memberId: row.staffId || row.id,
        photoVersion: row.photoVersion,
        url: row.url,
      })),
    );
    fetched += rows.length;
  }
  return { fetched, batches: chunks.length };
}
