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
  // Allow all-off: disable every status group, then grant portal access per member.
  // Unset/empty input still yields DEFAULT (Active + Hold) via the seed above.
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

function countRows(data) {
  return Array.isArray(data) ? data.length : 0;
}

/**
 * Bulk-apply portal_enabled / portal_status for each status key in the map.
 * Does not delete PIN/QR. Status match is case-insensitive (Active/active).
 * Returns counts per status.
 */
export async function syncMembersPortalAccessByStatus(sb, gymId, accessByStatus) {
  const map = normalizePortalAccessByStatus(accessByStatus);
  const results = {};
  const now = new Date().toISOString();

  for (const [statusKey, allowed] of Object.entries(map)) {
    if (allowed) {
      // Re-open disabled members who already have a PIN → active
      const { data: withPin, error: withPinErr } = await sb
        .from("members")
        .update({
          portal_enabled: true,
          portal_status: "active",
          updated_at: now,
        })
        .eq("gym_id", gymId)
        .ilike("status", statusKey)
        .is("deleted_at", null)
        .eq("portal_status", "disabled")
        .not("pin_hash", "is", null)
        .select("id");
      if (withPinErr) throw withPinErr;

      // Re-open disabled members without a PIN → pending (must enroll)
      const { data: noPin, error: noPinErr } = await sb
        .from("members")
        .update({
          portal_enabled: true,
          portal_status: "pending",
          updated_at: now,
        })
        .eq("gym_id", gymId)
        .ilike("status", statusKey)
        .is("deleted_at", null)
        .eq("portal_status", "disabled")
        .is("pin_hash", null)
        .select("id");
      if (noPinErr) throw noPinErr;

      // Ensure portal stays enabled for already-open members of this status
      const { data: others, error: othersErr } = await sb
        .from("members")
        .update({
          portal_enabled: true,
          updated_at: now,
        })
        .eq("gym_id", gymId)
        .ilike("status", statusKey)
        .is("deleted_at", null)
        .neq("portal_status", "disabled")
        .select("id");
      if (othersErr) throw othersErr;

      results[statusKey] = {
        allowed: true,
        updated: countRows(withPin) + countRows(noPin) + countRows(others),
      };
    } else {
      const { data: rows, error } = await sb
        .from("members")
        .update({
          portal_enabled: false,
          portal_status: "disabled",
          updated_at: now,
        })
        .eq("gym_id", gymId)
        .ilike("status", statusKey)
        .is("deleted_at", null)
        .select("id");
      if (error) throw error;
      results[statusKey] = {
        allowed: false,
        updated: countRows(rows),
      };
    }
  }
  return results;
}
