"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { membersApi } from "@/services/api";
import {
  getOfflineQueueCount,
  readOfflineQueue,
  removeOfflineMutation,
  type OfflineQueueItem,
} from "@/lib/offline-queue";
import { clearPendingMemberDelete } from "@/lib/domain/member-pending-deletes";
import { removeMemberDeleteTombstone } from "@/lib/domain/member-delete-tombstones";
import { clearPendingMemberCreate } from "@/lib/domain/member-pending-creates";
import type { Member } from "@/types";

async function flushItem(item: OfflineQueueItem) {
  if (item.kind === "member.patch" && item.memberId) {
    await membersApi.patch(item.memberId, (item.payload || {}) as Partial<Member>);
    return;
  }
  if (item.kind === "member.permanentDelete" && item.memberId) {
    await membersApi.permanentDelete(item.memberId);
    clearPendingMemberDelete(item.memberId);
    return;
  }
  if (item.kind === "member.bulk" && Array.isArray(item.payload)) {
    await membersApi.bulk(item.payload as Member[]);
    for (const row of item.payload as Member[]) {
      clearPendingMemberCreate(String(row?.memberId || ""));
    }
  }
}

/** Flush offline member mutations when the browser comes back online. */
export function useOfflineQueueFlush(enabled: boolean) {
  const qc = useQueryClient();
  const flushing = useRef(false);
  const [pendingCount, setPendingCount] = useState(0);

  const refreshCount = useCallback(() => {
    setPendingCount(getOfflineQueueCount());
  }, []);

  const flush = useCallback(async () => {
    if (!enabled || flushing.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const queue = readOfflineQueue();
    if (!queue.length) {
      refreshCount();
      return;
    }
    flushing.current = true;
    let flushed = 0;
    try {
      for (const item of queue) {
        try {
          await flushItem(item);
          removeOfflineMutation(item.id);
          flushed += 1;
        } catch {
          // Stop on first failure so order is preserved; retry later.
          break;
        }
      }
      if (flushed > 0) {
        toast.success(
          flushed === 1
            ? "1 offline change synced"
            : `${flushed} offline changes synced`,
        );
        await qc.invalidateQueries({ queryKey: ["members"] });
      }
    } finally {
      flushing.current = false;
      refreshCount();
    }
  }, [enabled, qc, refreshCount]);

  useEffect(() => {
    if (!enabled) return;
    refreshCount();
    const onOnline = () => void flush();
    const onStorage = () => refreshCount();
    window.addEventListener("online", onOnline);
    window.addEventListener("storage", onStorage);
    const timer = setInterval(() => void flush(), 10_000);
    void flush();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("storage", onStorage);
      clearInterval(timer);
    };
  }, [enabled, flush, refreshCount]);

  return { pendingCount, flush, refreshCount };
}

/** Drop a tombstone when a queued delete is abandoned after repeated failures (optional). */
export function abandonQueuedDelete(memberId: string) {
  clearPendingMemberDelete(memberId);
  removeMemberDeleteTombstone(memberId);
}
