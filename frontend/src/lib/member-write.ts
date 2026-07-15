import { membersApi } from "@/services/api";
import {
  enqueueOfflineMutation,
  isBrowserOffline,
  isLikelyNetworkError,
} from "@/lib/offline-queue";
import type { Member } from "@/types";

/** Patch member; if offline / network fails, queue for later flush. */
export async function patchMemberWithOfflineFallback(
  memberId: string,
  patch: Partial<Member>,
): Promise<{ queued: boolean; member?: Member }> {
  if (isBrowserOffline()) {
    enqueueOfflineMutation({
      kind: "member.patch",
      memberId,
      payload: patch,
    });
    return { queued: true };
  }
  try {
    const res = await membersApi.patch(memberId, patch);
    return { queued: false, member: res.member };
  } catch (err) {
    if (isLikelyNetworkError(err)) {
      enqueueOfflineMutation({
        kind: "member.patch",
        memberId,
        payload: patch,
      });
      return { queued: true };
    }
    throw err;
  }
}

export async function permanentDeleteWithOfflineFallback(memberId: string): Promise<{ queued: boolean }> {
  if (isBrowserOffline()) {
    enqueueOfflineMutation({
      kind: "member.permanentDelete",
      memberId,
    });
    return { queued: true };
  }
  try {
    await membersApi.permanentDelete(memberId);
    return { queued: false };
  } catch (err) {
    if (isLikelyNetworkError(err)) {
      enqueueOfflineMutation({
        kind: "member.permanentDelete",
        memberId,
      });
      return { queued: true };
    }
    throw err;
  }
}
