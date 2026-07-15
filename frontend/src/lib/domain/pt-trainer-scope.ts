import {
  isBranchAdminUser,
  isMasterOwnerUser,
  type AuthUser,
} from "@/lib/domain/permissions";
import { isPtEligibleMember } from "@/lib/domain/pt-eligibility";
import type { Member } from "@/types";
import type { PtClientProfile } from "@/types/pt";

type StaffLike = { id?: string; name?: string | null; email?: string | null };

/** Owner / branch admin see all PT clients in scope. */
export function canViewAllPtClients(user: AuthUser | null | undefined) {
  return isMasterOwnerUser(user) || isBranchAdminUser(user);
}

export function buildStaffAliasLookup(users: StaffLike[] = []): Map<string, string> {
  const map = new Map<string, string>();
  for (const u of users) {
    const canonical = String(u.id || "")
      .trim()
      .toLowerCase();
    if (!canonical) continue;
    map.set(canonical, canonical);
    const name = String(u.name || "")
      .trim()
      .toLowerCase();
    if (name) map.set(name, canonical);
    const emailLocal = String(u.email || "")
      .split("@")[0]
      .trim()
      .toLowerCase();
    if (emailLocal) map.set(emailLocal, canonical);
  }
  return map;
}

export function resolveStaffCanonical(
  value: unknown,
  aliasMap?: Map<string, string> | null,
): string {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return "";
  if (aliasMap?.has(raw)) return aliasMap.get(raw) || raw;
  return raw;
}

/** Tokens that identify who a PT client is assigned to. */
export function ptAssignmentTokens(
  member?: Pick<Member, "staff" | "trainerId" | "plan"> | null,
  profile?: Pick<PtClientProfile, "trainerId"> | { trainer?: unknown } | null,
): string[] {
  const tokens: string[] = [];
  const push = (v: unknown) => {
    const s = String(v || "").trim();
    if (s) tokens.push(s);
  };
  push((profile as { trainerId?: unknown } | null | undefined)?.trainerId);
  push((profile as { trainer?: unknown } | null | undefined)?.trainer);
  push(member?.staff);
  push(member?.trainerId);

  const plan = String(member?.plan || "").trim();
  // Convention: PT-Raja / PT_Kaushik / PT Raja → trainer name/id suffix
  const suffix = plan.match(/\bpt[-_\s]+(.+)$/i)?.[1]?.trim();
  if (suffix) push(suffix);

  return tokens;
}

export function ptClientAssignedToViewer(
  member: Pick<Member, "staff" | "trainerId" | "plan"> | null | undefined,
  profile: PtClientProfile | null | undefined,
  viewer: AuthUser | null | undefined,
  aliasMap?: Map<string, string> | null,
): boolean {
  if (!viewer) return false;
  const viewerKeys = new Set(
    [
      resolveStaffCanonical(viewer.id, aliasMap),
      resolveStaffCanonical(viewer.name, aliasMap),
    ].filter(Boolean),
  );
  if (!viewerKeys.size) return false;

  const assigned = ptAssignmentTokens(member, profile)
    .map((t) => resolveStaffCanonical(t, aliasMap))
    .filter(Boolean);
  if (!assigned.length) return false;

  return assigned.some((token) => viewerKeys.has(token));
}

/**
 * PT roster for the current viewer.
 * Admins: all eligible PT members.
 * Staff: only clients assigned to them (trainerId / staff / PT-Name plan).
 */
export function filterPtMembersForViewer(
  members: Member[],
  profiles: Record<string, PtClientProfile> | null | undefined,
  viewer: AuthUser | null | undefined,
  users: StaffLike[] = [],
): Member[] {
  const eligible = (members || []).filter((m) => isPtEligibleMember(m));
  if (canViewAllPtClients(viewer)) return eligible;

  const aliasMap = buildStaffAliasLookup(users);
  // Ensure the viewer's own id/name resolve even if users list is thin.
  const selfId = String(viewer?.id || "")
    .trim()
    .toLowerCase();
  if (selfId) aliasMap.set(selfId, selfId);
  const selfName = String(viewer?.name || "")
    .trim()
    .toLowerCase();
  if (selfName) aliasMap.set(selfName, selfId || selfName);

  const map = profiles && typeof profiles === "object" ? profiles : {};
  return eligible.filter((m) =>
    ptClientAssignedToViewer(m, map[m.memberId] as PtClientProfile | undefined, viewer, aliasMap),
  );
}
