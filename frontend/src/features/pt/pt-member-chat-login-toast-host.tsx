"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useMembers, useSettings, useUsers } from "@/hooks/use-data";
import { filterPtMembersForViewer } from "@/lib/domain/pt-trainer-scope";
import { canAccessSection } from "@/lib/domain/permissions";
import { useAuthStore, useUiStore } from "@/stores";
import type { PtClientProfile } from "@/types/pt";

const WINDOW_MS = 24 * 60 * 60 * 1000;

function toastKey(userId: string) {
  return `apg.ptMemberChatLoginToast.${String(userId || "").trim().toLowerCase()}`;
}

function alreadyToasted(userId: string, loginAt: string) {
  try {
    return sessionStorage.getItem(toastKey(userId)) === loginAt;
  } catch {
    return false;
  }
}

function markToasted(userId: string, loginAt: string) {
  try {
    sessionStorage.setItem(toastKey(userId), loginAt);
  } catch {
    /* ignore */
  }
}

function memberChatAtMs(profile: PtClientProfile | null | undefined): number | null {
  if (!profile) return null;
  const fromField = Date.parse(String(profile.lastMemberChatAt || ""));
  if (Number.isFinite(fromField)) return fromField;
  const msgs = Array.isArray(profile.chat) ? profile.chat : [];
  let best: number | null = null;
  for (const msg of msgs) {
    if (msg?.from !== "member") continue;
    const ms = Date.parse(String(msg.ts || ""));
    if (!Number.isFinite(ms)) continue;
    if (best == null || ms > best) best = ms;
  }
  return best;
}

/**
 * After Owner/Staff login, toast when any visible PT client messaged in the last 24h.
 * Uses the same window as Chat Trainer "New". Captures justLoggedInAt in a ref so the
 * late-arrival host clearing that flag does not skip this toast.
 */
export function PtMemberChatLoginToastHost() {
  const user = useAuthStore((s) => s.user);
  const justLoggedInAt = useUiStore((s) => s.justLoggedInAt);
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const { data: members = [], isLoading: membersLoading } = useMembers();
  const { data: users = [] } = useUsers();
  const router = useRouter();
  const pendingLoginAtRef = useRef<string | null>(null);
  const handledLoginAtRef = useRef<string | null>(null);

  useEffect(() => {
    if (justLoggedInAt) pendingLoginAtRef.current = justLoggedInAt;
  }, [justLoggedInAt]);

  useEffect(() => {
    const loginAt = pendingLoginAtRef.current;
    if (!user?.id || !loginAt) return;
    if (!canAccessSection(user, "PT Clients")) return;
    if (settingsLoading || membersLoading) return;
    if (handledLoginAtRef.current === loginAt) return;
    if (alreadyToasted(user.id, loginAt)) {
      handledLoginAtRef.current = loginAt;
      pendingLoginAtRef.current = null;
      return;
    }

    const profilesMap =
      (settings?.ptClientProfiles as Record<string, PtClientProfile> | undefined) || {};
    const ptMembers = filterPtMembersForViewer(members, profilesMap, user, users);

    markToasted(user.id, loginAt);
    handledLoginAtRef.current = loginAt;
    pendingLoginAtRef.current = null;

    if (!ptMembers.length) return;

    const now = Date.now();
    const withNew: Array<{ name: string; memberId: string }> = [];
    for (const m of ptMembers) {
      const profile = profilesMap[m.memberId];
      const ms = memberChatAtMs(profile);
      if (ms == null) continue;
      if (now - ms < 0 || now - ms >= WINDOW_MS) continue;
      withNew.push({ name: String(m.name || "PT client"), memberId: m.memberId });
    }

    if (!withNew.length) return;

    const count = withNew.length;
    const title =
      count === 1
        ? `${withNew[0].name} sent a PT chat message`
        : `${count} PT clients sent chat messages`;
    const description =
      count === 1
        ? "Open PT Clients → Chat Trainer to reply."
        : "Open PT Clients to review Chat Trainer messages.";

    toast.message(title, {
      description,
      duration: 10_000,
      action: {
        label: "Open PT",
        onClick: () => router.push("/pt"),
      },
    });
  }, [
    user,
    justLoggedInAt,
    settings,
    settingsLoading,
    members,
    membersLoading,
    users,
    router,
  ]);

  return null;
}
