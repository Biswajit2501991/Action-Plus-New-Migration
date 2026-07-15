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

/** Create/update via bulk; queue when offline so Add Member stays instant. */
export async function bulkCreateMemberWithOfflineFallback(
  members: Member[],
): Promise<{ queued: boolean }> {
  const list = Array.isArray(members) ? members : [];
  if (!list.length) return { queued: false };
  if (isBrowserOffline()) {
    enqueueOfflineMutation({
      kind: "member.bulk",
      memberId: String(list[0]?.memberId || ""),
      payload: list,
    });
    return { queued: true };
  }
  try {
    await membersApi.bulk(list);
    return { queued: false };
  } catch (err) {
    if (isLikelyNetworkError(err)) {
      enqueueOfflineMutation({
        kind: "member.bulk",
        memberId: String(list[0]?.memberId || ""),
        payload: list,
      });
      return { queued: true };
    }
    throw err;
  }
}
