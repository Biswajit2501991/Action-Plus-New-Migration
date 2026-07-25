import { authCookieModeEnabled } from "@/lib/auth-cookie-mode";

export const AUTH_SESSION_KEY = "apg.auth.session";

export type AuthSession = {
  userId: string;
  token?: string;
  expiresAt: number;
};

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export function readAuthSession(): AuthSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.userId) return null;
    if (!authCookieModeEnabled() && !parsed?.token) return null;
    if (parsed.expiresAt && parsed.expiresAt < Date.now()) {
      clearAuthSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeAuthSession(userId: string, token: string): void {
  const session: AuthSession = {
    userId: String(userId),
    expiresAt: Date.now() + SESSION_TTL_MS,
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

export function touchAuthSession(): void {
  const session = readAuthSession();
  if (!session) return;
  writeAuthSession(session.userId, session.token || "");
}
