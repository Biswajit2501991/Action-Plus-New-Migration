import { authFetchCredentials } from "@/lib/auth-cookie-mode";
import { clearAuthSession, readAuthToken } from "@/lib/auth-storage";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "/api").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "ApiError";
  }
}

export type ApiFetchOptions = {
  skipAuth?: boolean;
};

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  "invalid-credentials": "Invalid login ID or password.",
  "user-blocked": "This staff account is blocked. Contact the owner.",
  unauthorized: "Session expired. Please sign in again.",
  "invalid-token": "Session expired. Please sign in again.",
  "identifier-password-required": "Login ID and password are required.",
  "auth-requires-supabase": "Authentication requires a connected backend.",
};

async function readErrorBody(res: Response): Promise<{ error?: string; message?: string } | null> {
  try {
    return (await res.json()) as { error?: string; message?: string };
  } catch {
    return null;
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  options: ApiFetchOptions = {},
): Promise<T> {
  const token = options.skipAuth ? "" : readAuthToken();
  const headers: Record<string, string> = {
    ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
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
    const hadAuth = Boolean(token) || authFetchCredentials() === "include";
    if (hadAuth) clearAuthSession();
    const code = body?.error ? String(body.error) : "unauthorized";
    throw new ApiError(
      401,
      AUTH_ERROR_MESSAGES[code] || body?.message || "Session expired. Please sign in again.",
      code,
    );
  }

  if (!res.ok) {
    const body = await readErrorBody(res);
    const code = body?.error ? String(body.error) : undefined;
    throw new ApiError(
      res.status,
      body?.message || (code && AUTH_ERROR_MESSAGES[code]) || code || `Request failed (${res.status})`,
      code,
    );
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function logoutApi(): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      credentials: authFetchCredentials(),
    });
  } catch {
    // ignore
  }
}
