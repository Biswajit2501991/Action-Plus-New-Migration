/** Gym-level Member Portal access by membership status (separate from home tiles). */

export const DEFAULT_PORTAL_ACCESS_BY_STATUS = {
  Active: true,
  Hold: true,
  Deactivated: false,
  Cancelled: false,
};

export function normalizePortalAccessByStatus(input) {
  const src =
    input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const out = { ...DEFAULT_PORTAL_ACCESS_BY_STATUS };
  for (const key of Object.keys(DEFAULT_PORTAL_ACCESS_BY_STATUS)) {
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

export function canonicalMemberStatus(status) {
  const raw = String(status || "").trim().toLowerCase();
  if (raw === "active") return "Active";
  if (raw === "hold") return "Hold";
  if (raw === "deactivated") return "Deactivated";
  if (raw === "cancelled" || raw === "canceled") return "Cancelled";
  return null;
}

export function isPortalAccessAllowedForStatus(status, accessByStatus) {
  const key = canonicalMemberStatus(status);
  if (!key) return false;
  const map = normalizePortalAccessByStatus(accessByStatus);
  return map[key] === true;
}

/**
 * Bulk-apply portal_enabled / portal_status for each status key in the map.
 * Does not delete PIN/QR. Returns counts per status.
 */
export async function syncMembersPortalAccessByStatus(sb, gymId, accessByStatus) {
  const map = normalizePortalAccessByStatus(accessByStatus);
  const results = {};
  for (const [statusKey, allowed] of Object.entries(map)) {
    const patch = allowed
      ? {
          portal_enabled: true,
          // Re-open disabled access; leave active/pending as-is via two-step would be complex —
          // set pending when previously disabled, else keep status with a SQL-friendly approach:
          portal_status: "pending",
        }
      : {
          portal_enabled: false,
          portal_status: "disabled",
        };

    if (allowed) {
      // Enable: turn on for this status; restore pending only when disabled.
      const { data: disabledRows } = await sb
        .from("members")
        .update({
          portal_enabled: true,
          portal_status: "pending",
          updated_at: new Date().toISOString(),
        })
        .eq("gym_id", gymId)
        .eq("status", statusKey)
        .is("deleted_at", null)
        .eq("portal_status", "disabled")
        .select("id");

      const { data: otherRows } = await sb
        .from("members")
        .update({
          portal_enabled: true,
          updated_at: new Date().toISOString(),
        })
        .eq("gym_id", gymId)
        .eq("status", statusKey)
        .is("deleted_at", null)
        .neq("portal_status", "disabled")
        .select("id");

      results[statusKey] = {
        allowed: true,
        updated:
          (Array.isArray(disabledRows) ? disabledRows.length : 0) +
          (Array.isArray(otherRows) ? otherRows.length : 0),
      };
    } else {
      const { data: rows, error } = await sb
        .from("members")
        .update({
          ...patch,
          updated_at: new Date().toISOString(),
        })
        .eq("gym_id", gymId)
        .eq("status", statusKey)
        .is("deleted_at", null)
        .select("id");
      if (error) throw error;
      results[statusKey] = {
        allowed: false,
        updated: Array.isArray(rows) ? rows.length : 0,
      };
    }
  }
  return results;
}
