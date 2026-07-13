"use client";

import { useEffect, useRef } from "react";
import { membersApi } from "@/services/api";
import { memberIdsNeedingPhotoUrls, syncMemberPhotoUrls } from "@/lib/domain/member-photo";
import type { Member } from "@/types";

/**
 * Hydrate signed member photo URLs after list load (same flow as prod).
 * Priority IDs (e.g. current page) are fetched first.
 */
export function useMemberPhotoHydration(
  members: Member[],
  opts?: { priorityIds?: string[]; enabled?: boolean },
) {
  const enabled = opts?.enabled !== false;
  const priorityKey = (opts?.priorityIds || []).join(",");
  const runId = useRef(0);

  useEffect(() => {
    if (!enabled || !members.length) return;
    if (!memberIdsNeedingPhotoUrls(members).length) return;

    const myRun = ++runId.current;
    let cancelled = false;

    void (async () => {
      try {
        await syncMemberPhotoUrls(
          members,
          (memberIds) => membersApi.photoUrls(memberIds),
          { priorityIds: opts?.priorityIds },
        );
      } catch {
        // Storage may be disabled or offline — avatars fall back to initials.
      }
      if (cancelled || myRun !== runId.current) return;
    })();

    return () => {
      cancelled = true;
    };
    // priorityKey captures priorityIds without deep-compare noise
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, members, priorityKey]);
}
