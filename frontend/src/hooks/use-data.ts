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
import { useAuthStore } from "@/stores";

export function useMembers() {
  const authed = Boolean(useAuthStore((s) => s.user));
  return useQuery({
    queryKey: ["members"],
    queryFn: membersApi.list,
    enabled: authed,
  });
}

export function useVisitors() {
  const authed = Boolean(useAuthStore((s) => s.user));
  return useQuery({
    queryKey: ["visitors"],
    queryFn: visitorsApi.list,
    enabled: authed,
  });
}

export function useUsers() {
  const authed = Boolean(useAuthStore((s) => s.user));
  return useQuery({
    queryKey: ["users"],
    queryFn: usersApi.list,
    enabled: authed,
  });
}

export function useSettings() {
  const authed = Boolean(useAuthStore((s) => s.user));
  return useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.get,
    enabled: authed,
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
  });
}

export function useLogs() {
  const authed = Boolean(useAuthStore((s) => s.user));
  return useQuery({
    queryKey: ["logs"],
    queryFn: logsApi.list,
    enabled: authed,
  });
}

export function useAttendance() {
  const authed = Boolean(useAuthStore((s) => s.user));
  return useQuery({
    queryKey: ["attendance"],
    queryFn: () => attendanceApi.records(),
    enabled: authed,
  });
}

export function useGymCodes() {
  const authed = Boolean(useAuthStore((s) => s.user));
  return useQuery({
    queryKey: ["gym-codes"],
    queryFn: gymCodesApi.list,
    enabled: authed,
  });
}

export function useWhatsapp() {
  const authed = Boolean(useAuthStore((s) => s.user));
  return useQuery({
    queryKey: ["whatsapp"],
    queryFn: async () => {
      const [templates, events, custom] = await Promise.all([
        whatsappApi.templates().catch(() => ({})),
        whatsappApi.smsEvents().catch(() => []),
        whatsappApi.customTemplates().catch(() => []),
      ]);
      return { templates, events, custom };
    },
    enabled: authed,
  });
}
