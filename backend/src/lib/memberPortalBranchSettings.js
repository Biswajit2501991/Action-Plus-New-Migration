/**
 * Per-branch Member Portal soft gates.
 * Missing row → portal allowed + inherit gym-wide sections (no behavior change).
 * Never rewrites members.portal_enabled.
 */

import {
  DEFAULT_PORTAL_SECTIONS,
  mergePortalSections,
  normalizePortalSections,
} from "./memberPortalUiConfig.js";

export const BRANCH_PORTAL_DISABLED_MESSAGE =
  "Member Portal is turned off for your branch. Contact the gym.";

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} gymId
 * @param {string | null | undefined} gymCodeId
 */
export async function loadBranchPortalSettingsRow(sb, gymId, gymCodeId) {
  const gid = String(gymId || "").trim();
  const branchId = String(gymCodeId || "").trim();
  if (!sb || !gid || !branchId) return null;
  const { data, error } = await sb
    .from("member_portal_branch_settings")
    .select("gym_id, gym_code_id, portal_enabled, portal_sections, updated_at, updated_by")
    .eq("gym_id", gid)
    .eq("gym_code_id", branchId)
    .maybeSingle();
  if (error) {
    // Table may not exist yet — treat as missing row (fully allowed).
    const msg = String(error.message || "");
    if (/relation|does not exist|schema cache/i.test(msg)) return null;
    throw error;
  }
  return data || null;
}

/**
 * Soft gate: missing row or portal_enabled !== false → allowed.
 * @param {{ portal_enabled?: boolean } | null | undefined} row
 */
export function isBranchPortalAllowed(row) {
  if (!row) return true;
  return row.portal_enabled !== false;
}

/**
 * Effective sections = merge(branch override, gym-wide).
 * Null branch portal_sections → gym-wide only.
 */
export function effectivePortalSections(gymWideSections, branchRow) {
  const gymWide = mergePortalSections(
    gymWideSections,
    DEFAULT_PORTAL_SECTIONS,
  );
  if (!branchRow || branchRow.portal_sections == null) return gymWide;
  return mergePortalSections(branchRow.portal_sections, gymWide);
}

/**
 * Resolve login gate + effective sections for a member's branch.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} gymId
 * @param {string | null | undefined} assignedGymCodeId
 * @param {unknown} gymWidePortalSections
 */
export async function resolveMemberBranchPortalAccess(
  sb,
  gymId,
  assignedGymCodeId,
  gymWidePortalSections,
) {
  const row = await loadBranchPortalSettingsRow(sb, gymId, assignedGymCodeId);
  return {
    branchPortalAllowed: isBranchPortalAllowed(row),
    portalSections: effectivePortalSections(gymWidePortalSections, row),
    branchRow: row,
    hasBranchOverride: Boolean(row),
  };
}

/**
 * Normalize PUT body for branch settings upsert.
 * @param {unknown} body
 * @param {{ portal_enabled?: boolean, portal_sections?: unknown } | null} existing
 */
export function normalizeBranchPortalSettingsPayload(body, existing = null) {
  const src = body && typeof body === "object" ? body : {};
  const portalEnabled =
    src.portal_enabled !== undefined
      ? Boolean(src.portal_enabled)
      : existing?.portal_enabled !== false;

  let portalSections = null;
  if (src.portal_sections !== undefined) {
    if (src.portal_sections === null) {
      portalSections = null;
    } else {
      portalSections = normalizePortalSections(src.portal_sections);
    }
  } else if (existing?.portal_sections != null) {
    portalSections = normalizePortalSections(existing.portal_sections);
  } else {
    portalSections = null;
  }

  return { portal_enabled: portalEnabled, portal_sections: portalSections };
}
