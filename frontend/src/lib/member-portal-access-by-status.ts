/** Gym-level Member Portal access by membership status (separate from home-tile toggles). */

export type PortalAccessStatusKey = "Active" | "Hold" | "Deactivated" | "Cancelled";

export type PortalAccessByStatus = Record<PortalAccessStatusKey, boolean>;

/** Matches historical portal gate: Active + Hold only. */
export const DEFAULT_PORTAL_ACCESS_BY_STATUS: PortalAccessByStatus = {
  Active: true,
  Hold: true,
  Deactivated: false,
  Cancelled: false,
};

export const PORTAL_ACCESS_STATUS_META: Array<{
  key: PortalAccessStatusKey;
  label: string;
  description: string;
}> = [
  {
    key: "Active",
    label: "Active members",
    description: "Grant Member Portal login for Active members.",
  },
  {
    key: "Hold",
    label: "Hold members",
    description: "Grant Member Portal login for Hold members.",
  },
  {
    key: "Deactivated",
    label: "Deactivated members",
    description: "Grant Member Portal login for Deactivated members.",
  },
  {
    key: "Cancelled",
    label: "Cancelled members",
    description: "Grant Member Portal login for Cancelled members.",
  },
];

export function normalizePortalAccessByStatus(input: unknown): PortalAccessByStatus {
  const src =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const out: PortalAccessByStatus = { ...DEFAULT_PORTAL_ACCESS_BY_STATUS };
  for (const key of Object.keys(DEFAULT_PORTAL_ACCESS_BY_STATUS) as PortalAccessStatusKey[]) {
    const lower = key.toLowerCase();
    if (key in src) out[key] = Boolean(src[key]);
    else if (lower in src) out[key] = Boolean(src[lower]);
  }
  // All-false bricks every member login — treat as unset and keep historical Active/Hold.
  if (!out.Active && !out.Hold && !out.Deactivated && !out.Cancelled) {
    return { ...DEFAULT_PORTAL_ACCESS_BY_STATUS };
  }
  return out;
}

export function canonicalMemberStatus(status: unknown): PortalAccessStatusKey | null {
  const raw = String(status || "").trim().toLowerCase();
  if (raw === "active") return "Active";
  if (raw === "hold") return "Hold";
  if (raw === "deactivated") return "Deactivated";
  if (raw === "cancelled" || raw === "canceled") return "Cancelled";
  return null;
}

export function isPortalAccessAllowedForStatus(
  status: unknown,
  accessByStatus?: PortalAccessByStatus | null,
): boolean {
  const key = canonicalMemberStatus(status);
  if (!key) return false;
  const map = normalizePortalAccessByStatus(accessByStatus);
  return map[key] === true;
}

/** Patch fields when applying status-based portal policy to one member. */
export function portalAccessPatchForStatus(
  status: unknown,
  accessByStatus: PortalAccessByStatus | null | undefined,
  opts?: { hasPortalPin?: boolean },
): { portalEnabled: boolean; portalStatus: string } {
  const allowed = isPortalAccessAllowedForStatus(status, accessByStatus);
  if (!allowed) {
    return { portalEnabled: false, portalStatus: "disabled" };
  }
  return {
    portalEnabled: true,
    portalStatus: opts?.hasPortalPin ? "active" : "pending",
  };
}
