/** In-flight delete IDs used when reconciling tombstones after list refresh. */

const pending = new Set<string>();

export function markPendingMemberDelete(memberId: string) {
  const id = String(memberId || "").trim();
  if (id) pending.add(id);
}

export function clearPendingMemberDelete(memberId: string) {
  const id = String(memberId || "").trim();
  if (id) pending.delete(id);
}

export function getPendingMemberDeleteIds() {
  return [...pending];
}
