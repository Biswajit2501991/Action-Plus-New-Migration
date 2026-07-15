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
 * Safe to call from AppShell — only runs when authenticated.
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
        queryKey: ["members", branchId],
        queryFn: membersApi.list,
        staleTime: STALE.lists,
      }),
      qc.prefetchQuery({
        queryKey: ["settings", "default"],
        queryFn: () => settingsApi.get(),
        staleTime: STALE.settings,
      }),
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
        queryKey: ["finance", month],
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
  }, [enabled, qc, branchId]);
}
