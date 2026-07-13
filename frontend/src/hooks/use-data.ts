"use client";

import { useQuery } from "@tanstack/react-query";
import {
  attendanceApi,
  financeApi,
  gymCodesApi,
  logsApi,
  membersApi,
  settingsApi,
  usersApi,
  visitorsApi,
  whatsappApi,
} from "@/services/api";
import { STALE } from "@/lib/query-cache";
import { useAuthStore } from "@/stores";

export function useMembers() {
  const authed = Boolean(useAuthStore((s) => s.user));
  return useQuery({
    queryKey: ["members"],
    queryFn: membersApi.list,
    enabled: authed,
    staleTime: STALE.lists,
  });
}

export function useVisitors() {
  const authed = Boolean(useAuthStore((s) => s.user));
  return useQuery({
    queryKey: ["visitors"],
    queryFn: visitorsApi.list,
    enabled: authed,
    staleTime: STALE.lists,
  });
}

export function useUsers() {
  const authed = Boolean(useAuthStore((s) => s.user));
  return useQuery({
    queryKey: ["users"],
    queryFn: usersApi.list,
    enabled: authed,
    staleTime: STALE.lists,
  });
}

export function useSettings(scope?: "core" | "leave" | "pt" | "full") {
  const authed = Boolean(useAuthStore((s) => s.user));
  return useQuery({
    queryKey: ["settings", scope || "default"],
    queryFn: () => settingsApi.get(scope),
    enabled: authed,
    staleTime: STALE.settings,
  });
}

export function useFinance(month?: string) {
  const authed = Boolean(useAuthStore((s) => s.user));
  return useQuery({
    queryKey: ["finance", month || "all"],
    queryFn: async () => {
      const [list, summary] = await Promise.all([
        financeApi.list().catch(() => [] as Awaited<ReturnType<typeof financeApi.list>>),
        financeApi.summary(month).catch(() => ({})),
      ]);
      return { transactions: list, summary };
    },
    enabled: authed,
    staleTime: STALE.finance,
  });
}

/** Server year summary for revenue trend (payment_transaction_date basis). */
export function useFinanceYearSummary(year?: number) {
  const authed = Boolean(useAuthStore((s) => s.user));
  const y = year || new Date().getFullYear();
  return useQuery({
    queryKey: ["finance-year", y],
    queryFn: () => financeApi.yearSummary(y),
    enabled: authed,
    staleTime: STALE.finance,
  });
}

export function useLogs() {
  const authed = Boolean(useAuthStore((s) => s.user));
  return useQuery({
    queryKey: ["logs"],
    queryFn: () => logsApi.listAll(),
    enabled: authed,
    staleTime: STALE.volatile,
  });
}

export function useAttendance(opts?: { startDate?: string; endDate?: string; enabled?: boolean }) {
  const user = useAuthStore((s) => s.user);
  const authed = Boolean(user);
  const isOwner =
    String(user?.id || "").toLowerCase() === "owner" ||
    String(user?.staffRole || user?.role || "")
      .toLowerCase()
      .includes("owner");
  const range = (() => {
    if (opts?.startDate && opts?.endDate) {
      return { startDate: opts.startDate, endDate: opts.endDate };
    }
    const end = new Date();
    const start = new Date();
    if (isOwner) start.setFullYear(start.getFullYear() - 5);
    else start.setMonth(start.getMonth() - 3);
    const fmt = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    return { startDate: fmt(start), endDate: fmt(end) };
  })();

  return useQuery({
    queryKey: ["attendance", range.startDate, range.endDate],
    queryFn: () => attendanceApi.records(range),
    enabled: authed && opts?.enabled !== false,
    staleTime: STALE.finance,
  });
}

export function useGymCodes() {
  const authed = Boolean(useAuthStore((s) => s.user));
  return useQuery({
    queryKey: ["gym-codes"],
    queryFn: gymCodesApi.list,
    enabled: authed,
    staleTime: STALE.settings,
  });
}

export function useWhatsapp() {
  const user = useAuthStore((s) => s.user);
  const authed = Boolean(user);
  const branchId = String(user?.activeBranchId || user?.gymCodeId || "").trim();
  return useQuery({
    queryKey: ["whatsapp", branchId || "default"],
    queryFn: async () => {
      const [templatesRes, events, custom] = await Promise.all([
        whatsappApi.templates(branchId || undefined).catch(() => ({ templates: {} })),
        whatsappApi.smsEvents().catch(() => []),
        whatsappApi.customTemplates().catch(() => []),
      ]);
      const templates =
        templatesRes && typeof templatesRes === "object" && "templates" in templatesRes
          ? (templatesRes.templates as Record<string, unknown>) || {}
          : (templatesRes as Record<string, unknown>) || {};
      return {
        templates,
        gymCodeId:
          templatesRes && typeof templatesRes === "object" && "gymCodeId" in templatesRes
            ? String((templatesRes as { gymCodeId?: string }).gymCodeId || branchId || "")
            : branchId,
        events,
        custom,
      };
    },
    enabled: authed,
    staleTime: STALE.volatile,
  });
}
