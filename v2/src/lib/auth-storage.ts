import { authCookieModeFromWindow } from '@/lib/auth-cookie-mode';

export const AUTH_SESSION_KEY = 'apg.auth.session';

export type AuthSession = {
  userId: string;
  token?: string;
  expiresAt: number;
};

/** Keep aligned with src/shared/authSessionTiming.js (default 2h). */
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export function readAuthSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.userId) return null;
    if (!authCookieModeFromWindow() && !parsed?.token) return null;
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
  const cookieMode = authCookieModeFromWindow();
  const session: AuthSession = {
    userId: String(userId),
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  if (!cookieMode && token) session.token = String(token);
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}

export function clearAuthSession(): void {
  try {
    localStorage.removeItem(AUTH_SESSION_KEY);
  } catch {
    // ignore quota / private mode errors
  }
  try {
    if (typeof window !== 'undefined' && window.__APG_SYNC_CONTEXT__) {
      window.__APG_SYNC_CONTEXT__ = {};
    }
  } catch {
    // ignore
  }
}

declare global {
  interface Window {
    __APG_SYNC_CONTEXT__?: Record<string, unknown>;
    __APG_ENV__?: { AUTH_COOKIE_MODE?: boolean };
  }
}

export function hasBackendAuthSession(): boolean {
  return Boolean(readAuthSession()?.userId);
}

export function readAuthToken(): string {
  if (authCookieModeFromWindow()) return '';
  return readAuthSession()?.token || '';
}
