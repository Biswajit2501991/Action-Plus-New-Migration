"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  fetchMe,
  login as loginApi,
  logout as logoutApi,
  requestPasswordReset,
  switchActiveBranch,
} from "@/services/api/auth";
import { attendanceApi } from "@/services/api";
import { readAuthSession, touchAuthSession } from "@/lib/auth-storage";
import {
  clearAppQueryCache,
  invalidateBranchScopedQueries,
} from "@/lib/query-cache";
import { useAuthStore, useBranchStore, useUiStore } from "@/stores";
import { ApiError } from "@/services/api/client";
import type { AuthUser } from "@/types";

function unwrapUser(payload: { user: AuthUser } | AuthUser): AuthUser {
  if (payload && typeof payload === "object" && "user" in payload && payload.user) {
    return payload.user as AuthUser;
  }
  return payload as AuthUser;
}

async function punchSafe(type: "login" | "logout", actorName?: string) {
  try {
    return await attendanceApi.punch({
      type,
      at: new Date().toISOString(),
      timeZone: "IST",
      actorName: actorName || undefined,
    });
  } catch {
    /* punch is best-effort — never block auth */
    return null;
  }
}

export function useAuth() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, hydrated, setUser, setHydrated, clear } = useAuthStore();
  const setActiveBranchId = useBranchStore((s) => s.setActiveBranchId);
  const setJustLoggedInAt = useUiStore((s) => s.setJustLoggedInAt);
  const setLateNoteOpen = useUiStore((s) => s.setLateNoteOpen);

  const hydrate = useCallback(async () => {
    const session = readAuthSession();
    if (!session) {
      setUser(null);
      setHydrated(true);
      return;
    }
    try {
      const me = await fetchMe();
      const u = unwrapUser(me);
      setUser(u);
      setActiveBranchId(u.activeBranchId || u.gymCodeId || null);
      touchAuthSession();
    } catch {
      clear();
      clearAppQueryCache(qc);
    } finally {
      setHydrated(true);
    }
  }, [clear, qc, setActiveBranchId, setHydrated, setUser]);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrate, hydrated]);

  const login = async (identifier: string, password: string) => {
    clearAppQueryCache(qc);
    const data = await loginApi(identifier, password);
    setUser(data.user);
    setActiveBranchId(data.user.activeBranchId || data.user.gymCodeId || null);
    const punchRecord = await punchSafe("login", data.user.name || data.user.id);
    const loginAt =
      String(punchRecord?.firstLoginAt || "").trim() || new Date().toISOString();
    setJustLoggedInAt(loginAt);
    setLateNoteOpen(false);
    toast.success(`Welcome back, ${data.user.name || data.user.id}`);
    return data.user;
  };

  const logout = async () => {
    const actor = user?.name || user?.id;
    await punchSafe("logout", actor);
    await logoutApi();
    clearAppQueryCache(qc);
    setJustLoggedInAt(null);
    setLateNoteOpen(false);
    clear();
    router.replace("/login");
  };

  const forgotPassword = async (identifier: string) => {
    await requestPasswordReset(identifier);
    toast.success("Reset request sent — the owner will be notified.");
  };

  const changeBranch = async (gymCodeId: string) => {
    try {
      const data = await switchActiveBranch(gymCodeId);
      const nextId = data.activeBranchId || data.gymCodeId || gymCodeId;
      setActiveBranchId(nextId);
      if (data.user) {
        setUser(data.user);
      } else if (user) {
        setUser({
          ...user,
          activeBranchId: nextId,
          gymCodeId: nextId,
          allowedBranchIds: data.allowedBranchIds || user.allowedBranchIds,
          assignedBranchIds: data.assignedBranchIds || user.assignedBranchIds,
        });
      }
      await invalidateBranchScopedQueries(qc);
      toast.success("Branch switched");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not switch branch");
    }
  };

  return {
    user,
    hydrated,
    isAuthenticated: Boolean(user),
    login,
    logout,
    forgotPassword,
    changeBranch,
    refresh: hydrate,
  };
}
