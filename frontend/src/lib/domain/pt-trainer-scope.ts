import {
  isBranchAdminUser,
  isMasterOwnerUser,
} from "@/lib/domain/permissions";
import { isPtEligibleMember } from "@/lib/domain/pt-eligibility";
import type { AuthUser, Member } from "@/types";
import type { PtClientProfile } from "@/types/pt";

type StaffLike = { id?: string; name?: string | null; email?: string | null };

/** Owner / branch admin see all PT clients in scope. */
export function canViewAllPtClients(user: AuthUser | null | undefined) {
  return isMasterOwnerUser(user) || isBranchAdminUser(user);
}

/**
 * Known login vs plan-suffix spelling differences (staff Koushik, plan PT-Kaushik).
 */
export const TRAINER_SPELLING_ALIASES: Array<[string, string]> = [
  ["koushik", "kaushik"],
];

export function seedTrainerSpellingAliases(
  aliasMap: Map<string, string> | null | undefined = null,
): Map<string, string> {
  const map = aliasMap instanceof Map ? aliasMap : new Map<string, string>();
  for (const [left, right] of TRAINER_SPELLING_ALIASES) {
    const a = String(left || "")
      .trim()
      .toLowerCase();
    const b = String(right || "")
      .trim()
      .toLowerCase();
    if (!a || !b) continue;
    const canonical = map.get(a) || map.get(b) || a;
    map.set(a, canonical);
    map.set(b, canonical);
  }
  return map;
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
  return seedTrainerSpellingAliases(map);
}

export function resolveStaffCanonical(
  value: unknown,
  aliasMap?: Map<string, string> | null,
): string {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return "";
  const map = seedTrainerSpellingAliases(aliasMap);
  if (map.has(raw)) return map.get(raw) || raw;
  return raw;
}

/** Exact / alias / short-prefix match (Bis → Biswajit). */
export function staffTokenMatchesViewer(token: string, viewerKeys: Set<string>) {
  const t = String(token || "")
    .trim()
    .toLowerCase();
  if (!t || !viewerKeys.size) return false;
  if (viewerKeys.has(t)) return true;
  for (const vk of viewerKeys) {
    const v = String(vk || "")
      .trim()
      .toLowerCase();
    if (!v) continue;
    if (t.length >= 3 && v.length >= 3 && (v.startsWith(t) || t.startsWith(v))) return true;
  }
  return false;
}

/** Extract trainer from PT-Raja or Personal Trainer (PT) - RAJA. */
export function ptPlanTrainerSuffix(plan: string | null | undefined) {
  const raw = String(plan || "").trim();
  if (!raw) return "";
  const compact = raw.match(/\bpt[-_\s]+(.+)$/i)?.[1]?.trim();
  if (compact) return compact;
  const paren = raw.match(/\(\s*pt\s*\)\s*[-–—:]\s*(.+)$/i)?.[1]?.trim();
  return paren || "";
}

/**
 * Tokens that identify who a PT client is assigned to.
 * Prefer plan suffix (PT-Raja) + profile trainer; enrollment staff only for generic PT plans.
 */
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

  const plan = String(member?.plan || "").trim();
  const suffix = ptPlanTrainerSuffix(plan);
  if (suffix) {
    push(suffix);
  } else {
    push(member?.staff);
    push(member?.trainerId);
  }

  return tokens;
}

export function ptClientAssignedToViewer(
  member: Pick<Member, "staff" | "trainerId" | "plan"> | null | undefined,
  profile: PtClientProfile | null | undefined,
  viewer: AuthUser | null | undefined,
  aliasMap?: Map<string, string> | null,
): boolean {
  if (!viewer) return false;
  const map = seedTrainerSpellingAliases(
    aliasMap instanceof Map ? new Map(aliasMap) : new Map(),
  );
  const viewerKeys = new Set(
    [
      resolveStaffCanonical(viewer.id, map),
      resolveStaffCanonical(viewer.name, map),
    ].filter(Boolean),
  );
  if (!viewerKeys.size) return false;

  const assigned = ptAssignmentTokens(member, profile)
    .map((t) => resolveStaffCanonical(t, map))
    .filter(Boolean);
  if (!assigned.length) return false;

  return assigned.some((token) => staffTokenMatchesViewer(token, viewerKeys));
}

/**
 * PT roster for the current viewer.
 * Admins: all eligible PT members.
 * Staff: only clients assigned to them (trainerId / PT-Name plan).
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
  const selfId = String(viewer?.id || "")
    .trim()
    .toLowerCase();
  if (selfId) aliasMap.set(selfId, selfId);
  const selfName = String(viewer?.name || "")
    .trim()
    .toLowerCase();
  if (selfName) aliasMap.set(selfName, selfId || selfName);
  seedTrainerSpellingAliases(aliasMap);

  const map = profiles && typeof profiles === "object" ? profiles : {};
  return eligible.filter((m) =>
    ptClientAssignedToViewer(m, map[m.memberId] as PtClientProfile | undefined, viewer, aliasMap),
  );
}
