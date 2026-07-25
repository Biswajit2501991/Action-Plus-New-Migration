import { isMasterOwnerUser } from "@/lib/domain/permissions";
import type { AuthUser, GymCode } from "@/types";

function normalizeBranchIdList(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
}

/**
 * Branches the user may access.
 * `null` = master owner (all branches).
 */
export function allowedBranchIdsForUser(user: AuthUser | null | undefined): string[] | null {
  if (!user) return [];
  if (isMasterOwnerUser(user)) return null;
  const fromAllowed = normalizeBranchIdList(user.allowedBranchIds);
  const fromAssigned = normalizeBranchIdList(user.assignedBranchIds);
  const union = normalizeBranchIdList([...fromAllowed, ...fromAssigned]);
  if (union.length) return union;
  const single = String(user.activeBranchId || user.gymCodeId || "").trim();
  return single ? [single] : [];
}

/** Branches shown in the header switcher (assigned only for staff). */
export function switchableBranchesForUser(
  user: AuthUser | null | undefined,
  gymCodes: GymCode[] | null | undefined = [],
): GymCode[] {
  const list = Array.isArray(gymCodes) ? gymCodes : [];
  const allowed = allowedBranchIdsForUser(user);
  if (allowed === null) return list;
  if (!allowed.length) return [];
  const byId = new Map(list.map((c) => [String(c.id), c]));
  return allowed.map((id) => {
    const hit = byId.get(String(id));
    if (hit) return hit;
    return {
      id: String(id),
      code: String(id).slice(0, 8).toUpperCase(),
      name: "Branch",
      branchName: "Branch",
    } as GymCode;
  });
}

export function shouldShowBranchSwitcher(
  user: AuthUser | null | undefined,
  gymCodes: GymCode[] | null | undefined = [],
) {
  if (!user) return false;
  return switchableBranchesForUser(user, gymCodes).length > 1;
}

export function userCanAccessBranch(
  user: AuthUser | null | undefined,
  gymCodeId: string | null | undefined,
) {
  const target = String(gymCodeId || "").trim();
  if (!target) return false;
  const allowed = allowedBranchIdsForUser(user);
  if (allowed === null) return true;
  return allowed.includes(target);
}
