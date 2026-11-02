"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  financeApi,
  gymCodesApi,
  membersApi,
  settingsApi,
  usersApi,
} from "@/services/api";
import { formatMonthKey } from "@/lib/utils";
import { STALE } from "@/lib/query-cache";
import { useAuthStore } from "@/stores";

/**
 * Warm core caches after login so Dashboard / Members / Finance open from memory.
 * Settings + members first; heavier lists wait for idle so first paint is not blocked.
 * Does not prefetch Logs (up to 5,000 rows) — that page loads its own window.
 */
export function useWarmAppDataCache(enabled: boolean) {
  const qc = useQueryClient();
  const warmed = useRef(false);
  const branchId = useAuthStore((s) =>
    String(s.user?.activeBranchId || s.user?.gymCodeId || ""),
  );

  useEffect(() => {
    if (!enabled) {
      warmed.current = false;
      return;
    }
    if (warmed.current) return;
    warmed.current = true;

    const month = formatMonthKey();

    void Promise.allSettled([
      qc.prefetchQuery({
        queryKey: ["settings", "default"],
        queryFn: () => settingsApi.get(),
        staleTime: STALE.settings,
      }),
      qc.prefetchQuery({
        queryKey: ["members", branchId],
        queryFn: membersApi.list,
        staleTime: STALE.lists,
      }),
    ]).then(() => {
      const later = () => {
        void Promise.allSettled([
          qc.prefetchQuery({
            queryKey: ["gym-codes"],
            queryFn: gymCodesApi.list,
            staleTime: STALE.settings,
          }),
          qc.prefetchQuery({
            queryKey: ["users"],
            queryFn: usersApi.list,
            staleTime: STALE.lists,
          }),
          qc.prefetchQuery({
            queryKey: ["finance", month, branchId || "all-branches"],
            queryFn: async () => {
              const [list, summary] = await Promise.all([
                financeApi.list().catch(() => [] as Awaited<ReturnType<typeof financeApi.list>>),
                financeApi.summary(month).catch(() => ({})),
              ]);
              return { transactions: list, summary };
            },
            staleTime: STALE.finance,
          }),
        ]);
      };
      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        window.requestIdleCallback(later, { timeout: 2500 });
      } else {
        setTimeout(later, 400);
      }
    });
  }, [enabled, qc, branchId]);
}
