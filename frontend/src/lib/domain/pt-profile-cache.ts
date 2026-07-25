import type { AppSettings } from "@/types";
import type { PtClientProfile } from "@/types/pt";

function profileUpdatedAtMs(profile: PtClientProfile | null | undefined) {
  return Date.parse(String(profile?.updatedAt || "")) || 0;
}

/**
 * Prefer the newer profile per member (by updatedAt) so a stale settings refetch
 * cannot wipe a diet/workout save that already landed in cache / DB.
 *
 * Only members present in `next` are kept (preserves trainer/branch filtering).
 */
export function preferNewerPtProfiles(
  prev: Record<string, PtClientProfile> | null | undefined,
  next: Record<string, PtClientProfile> | null | undefined,
): Record<string, PtClientProfile> {
  const a =
    prev && typeof prev === "object" && !Array.isArray(prev)
      ? (prev as Record<string, PtClientProfile>)
      : null;
  const b =
    next && typeof next === "object" && !Array.isArray(next)
      ? (next as Record<string, PtClientProfile>)
      : null;
  if (!b) return {};
  if (!a) return { ...b };

  const out: Record<string, PtClientProfile> = {};
  for (const [memberId, remote] of Object.entries(b)) {
    const local = a[memberId];
    if (!local) {
      out[memberId] = remote;
      continue;
    }
    const localTs = profileUpdatedAtMs(local);
    const remoteTs = profileUpdatedAtMs(remote);
    if (localTs > remoteTs) {
      out[memberId] = {
        ...remote,
        ...local,
        focusByDate: { ...(remote.focusByDate || {}), ...(local.focusByDate || {}) },
      };
    } else {
      out[memberId] = {
        ...local,
        ...remote,
        focusByDate: { ...(local.focusByDate || {}), ...(remote.focusByDate || {}) },
      };
    }
  }
  return out;
}

/** Keep newer ptClientProfiles when React Query replaces settings from a refetch. */
export function mergeSettingsPreserveNewerPt(
  oldData: AppSettings | undefined,
  newData: AppSettings | undefined,
): AppSettings | undefined {
  if (!newData) return oldData;
  if (!oldData) return newData;
  if (
    !Object.prototype.hasOwnProperty.call(newData, "ptClientProfiles") &&
    !Object.prototype.hasOwnProperty.call(oldData, "ptClientProfiles")
  ) {
    return newData;
  }
  // Leave-only payloads omit ptClientProfiles — don't invent an empty map.
  if (!Object.prototype.hasOwnProperty.call(newData, "ptClientProfiles")) {
    return newData;
  }
  return {
    ...newData,
    ptClientProfiles: preferNewerPtProfiles(
      oldData.ptClientProfiles as Record<string, PtClientProfile> | undefined,
      newData.ptClientProfiles as Record<string, PtClientProfile> | undefined,
    ),
  };
}
