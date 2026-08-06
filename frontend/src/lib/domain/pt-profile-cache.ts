import type { AppSettings } from "@/types";
import type { PtClientProfile } from "@/types/pt";
import { maxIsoTimestamp, withMergedPtChat } from "@/lib/domain/pt-chat-merge";

function profileUpdatedAtMs(profile: PtClientProfile | null | undefined) {
  return Date.parse(String(profile?.updatedAt || "")) || 0;
}

/**
 * Prefer the newer profile per member (by updatedAt) so a stale settings refetch
 * cannot wipe a diet/workout save that already landed in cache / DB.
 *
 * Chat is always unioned by message id so a newer local notes save cannot hide
 * member portal messages that arrived with an older/equal updatedAt, and vice versa.
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
    const base =
      localTs > remoteTs
        ? {
            ...remote,
            ...local,
            focusByDate: { ...(remote.focusByDate || {}), ...(local.focusByDate || {}) },
          }
        : {
            ...local,
            ...remote,
            focusByDate: { ...(local.focusByDate || {}), ...(remote.focusByDate || {}) },
          };
    const withChat = withMergedPtChat(base, localTs > remoteTs ? remote : local);
    out[memberId] = {
      ...withChat,
      updatedAt:
        maxIsoTimestamp(local.updatedAt, remote.updatedAt) || base.updatedAt || withChat.updatedAt,
    };
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
