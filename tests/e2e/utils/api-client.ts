const API_BASE = process.env.E2E_API_URL || 'http://127.0.0.1:4000';

export type AuthSession = { token: string; userId: string };

export async function apiHealthOk(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.ok === true && body?.dataBackend === 'supabase';
  } catch {
    return false;
  }
}

export async function loginOwner(
  identifier = process.env.E2E_OWNER_ID || 'owner',
  password = process.env.E2E_OWNER_PASSWORD || 'owner',
): Promise<AuthSession> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`login failed ${res.status}: ${text}`);
  }
  const data = await res.json();
  return { token: data.token, userId: data.user?.id || identifier };
}

export async function apiJson<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${init.method || 'GET'} ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function listStaff(token: string): Promise<Array<{ id: string }>> {
  return apiJson('/api/users', token);
}

export async function upsertStaff(
  token: string,
  user: Record<string, unknown>,
): Promise<void> {
  await apiJson('/api/users/bulk', token, {
    method: 'PUT',
    body: JSON.stringify({ users: [user] }),
  });
}

export async function setStaffPassword(
  token: string,
  staffId: string,
  newPassword: string,
): Promise<void> {
  await apiJson('/api/auth/admin-set-password', token, {
    method: 'POST',
    body: JSON.stringify({ staffId, newPassword }),
  });
}
