import { clearAuthSession, readAuthToken } from '@/lib/auth-storage';
import { authCookieModeFromWindow, authFetchCredentials } from '@/lib/auth-cookie-mode';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export type ApiFetchOptions = {
  /** Do not attach Authorization or clear session on 401 (e.g. POST /auth/login). */
  skipAuth?: boolean;
};

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'invalid-credentials': 'Invalid login ID or password.',
  'user-blocked': 'This staff account is blocked. Contact the owner.',
  unauthorized: 'Session expired. Please sign in again.',
  'invalid-token': 'Session expired. Please sign in again.',
};

async function readErrorBody(res: Response): Promise<{ error?: string; message?: string } | null> {
  try {
    return (await res.json()) as { error?: string; message?: string };
  } catch {
    return null;
  }
}

function messageFor401(
  body: { error?: string; message?: string } | null,
  hadAuth: boolean,
): string {
  const code = body?.error ? String(body.error) : '';
  if (code && AUTH_ERROR_MESSAGES[code]) return AUTH_ERROR_MESSAGES[code];
  if (body?.message) return String(body.message);
  if (!hadAuth && code === 'invalid-credentials') return AUTH_ERROR_MESSAGES['invalid-credentials'];
  return hadAuth
    ? 'Session expired. Please sign in again.'
    : 'Sign in failed. Check your credentials and try again.';
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  options: ApiFetchOptions = {},
): Promise<T> {
  const cookieMode = authCookieModeFromWindow();
  const token = options.skipAuth ? '' : readAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: authFetchCredentials(),
  });

  if (res.status === 401) {
    const body = await readErrorBody(res);
    const hadAuth = Boolean(token || cookieMode);
    if (hadAuth) {
      clearAuthSession();
    }
    throw new ApiError(401, messageFor401(body, hadAuth));
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    const body = await readErrorBody(res);
    if (body?.message) message = String(body.message);
    else if (body?.error) message = String(body.error);
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function logoutApi(): Promise<void> {
  if (!authCookieModeFromWindow()) return;
  try {
    await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' });
  } catch {
    // ignore network errors during logout
  }
}
