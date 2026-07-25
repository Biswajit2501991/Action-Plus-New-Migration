/** Client-side member delete tombstones — same key/behavior as Production. */

const STORAGE_KEY = "apg.members.deletedTombstones";

export function readMemberDeleteTombstones(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? [...new Set(parsed.map((id) => String(id || "").trim()).filter(Boolean))]
      : [];
  } catch {
    return [];
  }
}

export function addMemberDeleteTombstone(memberId: string) {
  const id = String(memberId || "").trim();
  if (!id || typeof window === "undefined") return;
  const next = new Set(readMemberDeleteTombstones());
  next.add(id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
}

export function removeMemberDeleteTombstone(memberId: string) {
  const id = String(memberId || "").trim();
  if (!id || typeof window === "undefined") return;
  const next = readMemberDeleteTombstones().filter((x) => x !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function isMemberDeleteTombstoned(
  memberId: string,
  tombstones: string[] | null = null,
) {
  const id = String(memberId || "").trim();
  if (!id) return false;
  const list = tombstones || readMemberDeleteTombstones();
  return list.includes(id);
}

/**
 * Keep tombstones only while delete is still in flight AND server still returns the row.
 * Clears when delete confirmed (absent) or member restored/re-added without pending delete.
 */
export function reconcileMemberDeleteTombstones(
  remoteMembers: { memberId?: string }[] | null | undefined,
  pendingDeleteIds: string[] = [],
) {
  if (typeof window === "undefined") return [];
  const remoteIds = new Set(
    (Array.isArray(remoteMembers) ? remoteMembers : [])
      .map((m) => String(m?.memberId || "").trim())
      .filter(Boolean),
  );
  const pending = new Set(
    (Array.isArray(pendingDeleteIds) ? pendingDeleteIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  );
  const kept = readMemberDeleteTombstones().filter((id) => pending.has(id) && remoteIds.has(id));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  return kept;
}

export function tombstonedMembersStillOnServer(
  remoteMembers: { memberId?: string }[] | null | undefined,
  tombstones: string[] | null = null,
) {
  const remoteIds = new Set(
    (Array.isArray(remoteMembers) ? remoteMembers : [])
      .map((m) => String(m?.memberId || "").trim())
      .filter(Boolean),
  );
  return (tombstones || readMemberDeleteTombstones()).filter((id) => remoteIds.has(id));
}

export function filterMembersExcludingTombstones<T extends { memberId?: string }>(
  members: T[] | null | undefined,
  tombstones: string[] | null = null,
): T[] {
  const tombstoneSet = new Set(tombstones || readMemberDeleteTombstones());
  return (Array.isArray(members) ? members : []).filter(
    (m) => !tombstoneSet.has(String(m?.memberId || "").trim()),
  );
}

export function sanitizeMembersForDisplay<T extends { memberId?: string }>(
  members: T[] | null | undefined,
  tombstones: string[] | null = null,
): T[] {
  return filterMembersExcludingTombstones(members, tombstones);
}
