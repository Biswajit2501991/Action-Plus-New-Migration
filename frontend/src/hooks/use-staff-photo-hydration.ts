"use client";

import { useEffect, useRef } from "react";
import { usersApi } from "@/services/api";
import { staffIdsNeedingPhotoUrls, syncStaffPhotoUrls } from "@/lib/domain/staff-photo";
import type { StaffUser } from "@/types";

/** Hydrate signed staff photo URLs (same cache as member photos). */
export function useStaffPhotoHydration(users: StaffUser[], enabled = true) {
  const runId = useRef(0);
  const usersRef = useRef(users);
  usersRef.current = users;
  const key = users
    .map((u) => `${u.id}:${u.photoVersion || 0}:${u.hasPhoto ? 1 : 0}`)
    .join("|");

  useEffect(() => {
    if (!enabled || !usersRef.current.length) return;
    if (!staffIdsNeedingPhotoUrls(usersRef.current).length) return;

    const myRun = ++runId.current;
    let cancelled = false;
    const snapshot = usersRef.current;

    void (async () => {
      try {
        await syncStaffPhotoUrls(snapshot, (staffIds) => usersApi.photoUrls(staffIds));
      } catch {
        // Storage may be disabled — avatars fall back to initials.
      }
      if (cancelled || myRun !== runId.current) return;
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, key]);
}
