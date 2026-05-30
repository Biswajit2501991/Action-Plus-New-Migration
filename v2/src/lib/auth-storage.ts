export const AUTH_SESSION_KEY = 'apg.auth.session';

export type AuthSession = {
  userId: string;
  token: string;
  expiresAt: number;
};

/** Keep aligned with src/shared/authSessionTiming.js (default 2h). */
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export function readAuthSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed?.token || !parsed?.userId) return null;
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
    token: String(token),
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
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
  }
}

export function readAuthToken(): string {
  return readAuthSession()?.token || '';
}
