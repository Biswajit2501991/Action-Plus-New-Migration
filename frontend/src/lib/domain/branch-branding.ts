import type { GymCode } from "@/types";

export const DEFAULT_GYM_DISPLAY_NAME = "Action Plus Gym";
/** Served from Next public assets (copied from prod `./assets/action-plus-logo.png`). */
export const DEFAULT_LOGO_PATH = "/assets/action-plus-logo.png";

export type BranchBranding = {
  gymCodeId: string | null;
  displayName: string;
  logoUrl: string;
  usesDefaultLogo: boolean;
  branchName?: string;
  code?: string;
};

export function resolveClientBranchBranding(
  row?: Partial<GymCode> | Record<string, unknown> | null,
): BranchBranding {
  const r = row || {};
  const branchName = String(r.branchName || r.name || "").trim();
  const displayRaw = String(r.displayName || r.display_name || "").trim();
  const displayName =
    displayRaw ||
    (branchName ? `Action Plus ${branchName}` : "") ||
    DEFAULT_GYM_DISPLAY_NAME;
  const logoRaw = String(r.logoUrl || r.logo_url || "").trim();
  return {
    gymCodeId: String(r.gymCodeId || r.id || "").trim() || null,
    displayName,
    logoUrl: logoRaw || DEFAULT_LOGO_PATH,
    usesDefaultLogo: !logoRaw,
    branchName: branchName || undefined,
    code: String(r.code || "").trim() || undefined,
  };
}

export function defaultClientBranding(): BranchBranding {
  return resolveClientBranchBranding({});
}

/** Pick branding for the signed-in user's active branch from gym-codes list. */
export function brandingForActiveBranch(
  gymCodes: GymCode[] | undefined,
  activeBranchId?: string | null,
): BranchBranding {
  const id = String(activeBranchId || "").trim();
  if (!id || !gymCodes?.length) return defaultClientBranding();
  const row = gymCodes.find((g) => String(g.id) === id);
  return row ? resolveClientBranchBranding(row) : defaultClientBranding();
}
