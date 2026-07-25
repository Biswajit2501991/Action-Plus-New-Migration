import { apiFetch, logoutApi } from "@/services/api/client";
import { clearAuthSession, readAuthSession, writeAuthSession } from "@/lib/auth-storage";
import type { AuthUser } from "@/types";

export type LoginResponse = {
  token?: string;
  user: AuthUser;
};

export async function login(identifier: string, password: string) {
  const data = await apiFetch<LoginResponse>(
    "/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    },
    { skipAuth: true },
  );
  writeAuthSession(String(data.user.id), data.token || "");
  return data;
}

export async function logout() {
  await logoutApi();
  clearAuthSession();
}

export async function fetchMe() {
  return apiFetch<{ user: AuthUser } | AuthUser>("/auth/me");
}

export async function requestPasswordReset(identifier: string) {
  return apiFetch<{ ok?: boolean }>("/auth/request-password-reset", {
    method: "POST",
    body: JSON.stringify({ identifier }),
  }, { skipAuth: true });
}

export async function changePassword(currentPassword: string, newPassword: string) {
  return apiFetch<{ ok?: boolean }>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function adminSetPassword(staffId: string, newPassword: string) {
  return apiFetch<{ ok?: boolean; staffId?: string; status?: string }>(
    "/auth/admin-set-password",
    {
      method: "POST",
      body: JSON.stringify({ staffId, newPassword }),
    },
  );
}

export async function rejectPasswordReset(staffId: string) {
  return apiFetch<{ ok?: boolean; staffId?: string; status?: string }>(
    "/auth/reject-password-reset",
    {
      method: "POST",
      body: JSON.stringify({ staffId }),
    },
  );
}

export type SwitchBranchResponse = {
  ok?: boolean;
  token?: string;
  gymCodeId?: string;
  activeBranchId?: string;
  allowedBranchIds?: string[];
  assignedBranchIds?: string[];
  user?: AuthUser;
};

export async function switchActiveBranch(gymCodeId: string) {
  const data = await apiFetch<SwitchBranchResponse>("/auth/active-branch", {
    method: "PATCH",
    body: JSON.stringify({ gymCodeId }),
  });
  if (data.token && data.user?.id) {
    writeAuthSession(String(data.user.id), data.token);
  } else if (data.token) {
    const session = readAuthSession();
    if (session?.userId) writeAuthSession(session.userId, data.token);
  }
  return data;
}

export async function refreshSession() {
  return apiFetch<{ token?: string; user?: AuthUser }>("/auth/refresh", { method: "POST" });
}
