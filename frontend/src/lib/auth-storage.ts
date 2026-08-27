import { authCookieModeEnabled } from "@/lib/auth-cookie-mode";

export const AUTH_SESSION_KEY = "apg.auth.session";

/** Keep aligned with src/shared/authSessionTiming.js */
export const AUTH_SESSION_TTL_MS = 2 * 60 * 60 * 1000;
export const AUTH_SESSION_IDLE_MS = 90 * 60 * 1000;

export type AuthSession = {
  userId: string;
  token?: string;
  expiresAt: number;
  lastActivityAt?: number;
};

export function isAuthSessionExpired(
  parsed: AuthSession | null | undefined,
  now = Date.now(),
): boolean {
  if (!parsed || typeof parsed !== "object") return true;
  const expiresAt = Number(parsed.expiresAt || 0);
  const lastActivityAt = Number(parsed.lastActivityAt || parsed.expiresAt || 0);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return true;
  if (now > expiresAt) return true;
  if (
    Number.isFinite(lastActivityAt) &&
    lastActivityAt > 0 &&
    now - lastActivityAt > AUTH_SESSION_IDLE_MS
  ) {
    return true;
  }
  return false;
}

function readRawAuthSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.userId) return null;
    if (!authCookieModeEnabled() && !parsed?.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readAuthSession(): AuthSession | null {
  const parsed = readRawAuthSession();
  if (!parsed) return null;
  if (isAuthSessionExpired(parsed)) {
    clearAuthSession();
    return null;
  }
  return parsed;
}

export function writeAuthSession(userId: string, token: string): void {
  const now = Date.now();
  const session: AuthSession = {
    userId: String(userId),
    expiresAt: now + AUTH_SESSION_TTL_MS,
    lastActivityAt: now,
  };
  if (!authCookieModeEnabled() && token) session.token = String(token);
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

export function clearAuthSession(): void {
  try {
    localStorage.removeItem(AUTH_SESSION_KEY);
  } catch {
    // ignore
  }
}

export function readAuthToken(): string {
  if (authCookieModeEnabled()) return "";
  return readAuthSession()?.token || "";
}

/** Slide absolute + idle clocks (call after login / successful /me / JWT refresh). */
export function touchAuthSession(): void {
  const session = readAuthSession();
  if (!session) return;
  writeAuthSession(session.userId, session.token || "");
}

/**
 * Activity-driven slide. Returns false when the session is already expired.
 * Uses raw read so a near-idle session can still be extended by a real gesture.
 */
export function touchAuthSessionActivity(): boolean {
  const session = readRawAuthSession();
  if (!session) return false;
  if (isAuthSessionExpired(session)) {
    clearAuthSession();
    return false;
  }
  writeAuthSession(session.userId, session.token || "");
  return true;
}

/** Decode JWT `exp` (ms). Cookie-mode sessions have no local token. */
export function readAuthTokenExpiresAtMs(token?: string): number | null {
  const raw = String(token || "").trim();
  const parts = raw.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const payload = JSON.parse(atob(b64 + pad)) as { exp?: number };
    const exp = Number(payload?.exp);
    if (!Number.isFinite(exp) || exp <= 0) return null;
    return exp * 1000;
  } catch {
    return null;
  }
}
