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

export async function pinStatus() {
  return apiFetch<{
    enabled: boolean;
    hasPin: boolean;
    hasSecurityAnswers: boolean;
    mustSetPin?: boolean;
  }>("/auth/pin-status");
}

export async function savePinSetup(body: {
  pin: string;
  answers?: Record<string, string>;
}) {
  const data = await apiFetch<{ ok?: boolean; token?: string; user?: AuthUser }>(
    "/auth/pin-setup",
    { method: "POST", body: JSON.stringify(body) },
  );
  if (data.token && data.user?.id) writeAuthSession(String(data.user.id), data.token);
  return data;
}

export async function recoverPinPassword(identifier: string, password: string) {
  return apiFetch<{ stage: string; attemptsLeft?: number; recoveryToken?: string }>(
    "/auth/pin-recover/password",
    { method: "POST", body: JSON.stringify({ identifier, password }) },
    { skipAuth: true },
  );
}

export async function recoverPinQuestions(identifier: string, answers: Record<string, string>) {
  return apiFetch<{ stage: string; recoveryToken?: string }>(
    "/auth/pin-recover/questions",
    { method: "POST", body: JSON.stringify({ identifier, answers }) },
    { skipAuth: true },
  );
}

export async function requestPinReset(identifier: string) {
  return apiFetch<{ ok?: boolean; stage?: string }>(
    "/auth/pin-recover/request",
    { method: "POST", body: JSON.stringify({ identifier }) },
    { skipAuth: true },
  );
}

export async function setRecoveredPin(recoveryToken: string, pin: string) {
  return apiFetch<{ ok?: boolean }>(
    "/auth/pin-recover/set-pin",
    { method: "POST", body: JSON.stringify({ recoveryToken, pin }) },
    { skipAuth: true },
  );
}

export async function revealStaffPin(staffId: string, ownerPassword: string) {
  return apiFetch<{ pin: string | null; available: boolean; name?: string }>(
    "/auth/reveal-staff-pin",
    { method: "POST", body: JSON.stringify({ staffId, ownerPassword }) },
  );
}

export async function approvePinReset(staffId: string, tempPassword: string, ownerPassword: string) {
  return apiFetch<{ ok?: boolean; tempPassword?: string; expiresAt?: string }>(
    "/auth/approve-pin-reset",
    { method: "POST", body: JSON.stringify({ staffId, tempPassword, ownerPassword }) },
  );
}

export async function rejectPinReset(staffId: string) {
  return apiFetch<{ ok?: boolean }>("/auth/reject-pin-reset", {
    method: "POST",
    body: JSON.stringify({ staffId }),
  });
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
  const data = await apiFetch<{ ok?: boolean; token?: string; user?: AuthUser }>(
    "/auth/refresh",
    { method: "POST" },
  );
  if (data.token) {
    const session = readAuthSession();
    if (session?.userId) writeAuthSession(session.userId, data.token);
  }
  return data;
}
