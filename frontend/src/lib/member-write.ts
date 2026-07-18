import { membersApi } from "@/services/api";
import {
  assertBulkCreatePersisted,
  type MembersBulkWriteResult,
} from "@/lib/domain/member-bulk-create";
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
  // Never send photo via PATCH — storage uploads use a dedicated endpoint, and
  // empty photo fields from list rows would previously 400 the whole status save.
  const safePatch: Partial<Member> = { ...patch };
  delete (safePatch as { photo?: string }).photo;
  delete (safePatch as { paymentHistory?: unknown }).paymentHistory;

  if (isBrowserOffline()) {
    enqueueOfflineMutation({
      kind: "member.patch",
      memberId,
      payload: safePatch,
    });
    return { queued: true };
  }
  try {
    const res = await membersApi.patch(memberId, safePatch);
    return { queued: false, member: res.member };
  } catch (err) {
    if (isLikelyNetworkError(err)) {
      enqueueOfflineMutation({
        kind: "member.patch",
        memberId,
        payload: safePatch,
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
): Promise<{ queued: boolean; result?: MembersBulkWriteResult }> {
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
    const result = await membersApi.bulk(list);
    assertBulkCreatePersisted(list, result);
    // Confirm durable read when API omitted `written` (legacy) or branch list may hide row.
    const id = String(list[0]?.memberId || "").trim();
    if (id && (!Array.isArray(result?.written) || !result.written.length)) {
      await membersApi.get(id);
    }
    return { queued: false, result };
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
