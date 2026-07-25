import { normalizePhone } from "@/lib/domain/members";
import type { Member } from "@/types";

export function membersSharingNormalizedPhone(
  members: Member[],
  phone: string | null | undefined,
  excludeMemberId = "",
): Member[] {
  const n = normalizePhone(phone);
  if (!n) return [];
  const ex = String(excludeMemberId || "").trim();
  return (Array.isArray(members) ? members : []).filter(
    (m) =>
      m &&
      String(m.memberId || "").trim() !== ex &&
      normalizePhone(m.mobile) === n,
  );
}

export function resolveFamilyGroupId(
  primary: Member | null | undefined,
  peers: Member[],
): string {
  const fromPrimary = String(primary?.familyGroupId || primary?.family_group_id || "").trim();
  if (fromPrimary) return fromPrimary;
  for (const m of peers) {
    const gid = String(m.familyGroupId || m.family_group_id || "").trim();
    if (gid) return gid;
  }
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `fam-${Date.now()}`;
}

export function familyMembersInGroup(members: Member[], groupId: string): Member[] {
  const gid = String(groupId || "").trim();
  if (!gid) return [];
  return (Array.isArray(members) ? members : []).filter(
    (m) => String(m.familyGroupId || m.family_group_id || "").trim() === gid,
  );
}

export function isAlreadySameFamily(a: Member, b: Member): boolean {
  const g0 = String(a.familyGroupId || a.family_group_id || "").trim();
  const g1 = String(b.familyGroupId || b.family_group_id || "").trim();
  return Boolean(g0 && g1 && g0 === g1);
}

/** Duplicate mobile that is not already linked in the same family group. */
export function findUnlinkedDuplicateMobile(
  members: Member[],
  candidate: Pick<Member, "memberId" | "mobile" | "familyGroupId">,
): Member | null {
  const phone = normalizePhone(candidate.mobile);
  if (!phone) return null;
  const id = String(candidate.memberId || "").trim();
  return (
    members.find((m) => {
      if (!m || String(m.memberId || "").trim() === id) return false;
      if (normalizePhone(m.mobile) !== phone) return false;
      if (isAlreadySameFamily(candidate as Member, m)) return false;
      return true;
    }) || null
  );
}
