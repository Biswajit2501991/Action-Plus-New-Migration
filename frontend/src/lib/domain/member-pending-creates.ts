/** Pending optimistic member creates — kept in localStorage until the server confirms. */

import type { Member } from "@/types";

const STORAGE_KEY = "apg.members.pendingCreates";

type PendingCreateMap = Record<string, Member>;

function readMap(): PendingCreateMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as PendingCreateMap)
      : {};
  } catch {
    return {};
  }
}

function writeMap(map: PendingCreateMap) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function markPendingMemberCreate(member: Member) {
  const id = String(member?.memberId || "").trim();
  if (!id) return;
  const next = readMap();
  next[id] = member;
  writeMap(next);
}

export function clearPendingMemberCreate(memberId: string) {
  const id = String(memberId || "").trim();
  if (!id) return;
  const next = readMap();
  if (!(id in next)) return;
  delete next[id];
  writeMap(next);
}

export function getPendingMemberCreates(): Member[] {
  return Object.values(readMap()).filter((m) => String(m?.memberId || "").trim());
}

export function getPendingMemberCreateIds(): string[] {
  return Object.keys(readMap());
}

/**
 * Keep optimistic creates visible until the server list includes them.
 * Clears pending entries once the remote list confirms the memberId.
 */
export function mergePendingCreatesIntoMembers(
  remoteMembers: Member[] | null | undefined,
): Member[] {
  const remote = Array.isArray(remoteMembers) ? remoteMembers : [];
  const remoteIds = new Set(
    remote.map((m) => String(m?.memberId || "").trim()).filter(Boolean),
  );
  const pending = readMap();
  const kept: PendingCreateMap = {};
  const optimistic: Member[] = [];

  for (const [id, member] of Object.entries(pending)) {
    if (!id) continue;
    if (remoteIds.has(id)) continue; // confirmed on server
    kept[id] = member;
    optimistic.push(member);
  }

  writeMap(kept);
  if (!optimistic.length) return remote;
  return [...optimistic, ...remote];
}
