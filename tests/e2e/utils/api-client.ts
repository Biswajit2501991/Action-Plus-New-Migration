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

export type GymCode = { id: string; code: string; name?: string; branchName?: string };

export async function listGymCodes(token: string): Promise<GymCode[]> {
  return apiJson<GymCode[]>('/api/gym-codes', token);
}

export async function createGymCode(
  token: string,
  body: { code: string; name: string },
): Promise<GymCode> {
  return apiJson<GymCode>('/api/gym-codes', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteGymCode(token: string, id: string): Promise<void> {
  // DELETE returns 204 / empty body — apiJson would crash on empty JSON parse.
  const res = await rawApi(`/api/gym-codes/${encodeURIComponent(id)}`, token, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DELETE /api/gym-codes/${id} → ${res.status}: ${text}`);
  }
}

export type LoginResult = { token: string; user: { id: string; gymCodeId?: string | null } };

export async function login(identifier: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`login failed ${res.status}: ${text}`);
  }
  return res.json();
}

export async function listMembers(token: string, query = ''): Promise<Array<{ memberId: string; assignedGymCodeId?: string | null }>> {
  const qs = String(query || '').trim();
  return apiJson(`/api/members${qs ? (qs.startsWith('?') ? qs : `?${qs}`) : ''}`, token);
}

export async function listMembersSince(token: string, updatedSince: string): Promise<Array<{ memberId: string; assignedGymCodeId?: string | null }>> {
  return listMembers(token, `updatedSince=${encodeURIComponent(updatedSince)}`);
}

export async function fetchMember(token: string, memberId: string): Promise<Record<string, unknown>> {
  return apiJson(`/api/members/${encodeURIComponent(memberId)}`, token);
}

export async function patchMember(
  token: string,
  memberId: string,
  patch: Record<string, unknown>,
): Promise<{ ok: boolean; member: { memberId: string; assignedGymCodeId?: string | null } }> {
  return apiJson(`/api/members/${encodeURIComponent(memberId)}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ patch }),
  });
}

export async function rawApi(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
}

// ----------------------------------------------------------------------------
// Phase 4 leave-request endpoints. The new POST /api/leave-requests bypasses
// the owner-only /api/settings/bulk route so staff can submit their own leaves
// and the owner receives a real-time notification via SSE.
// ----------------------------------------------------------------------------

export type LeaveRequest = {
  id: string;
  userId: string;
  type: 'Casual' | 'Sick' | 'Emergency' | 'Unpaid';
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  createdAt: string;
  createdBy: string;
};

export async function createLeaveRequest(
  token: string,
  body: {
    userId?: string;
    type?: LeaveRequest['type'];
    startDate: string;
    endDate: string;
    reason?: string;
  },
): Promise<{ ok: boolean; request: LeaveRequest }> {
  return apiJson('/api/leave-requests', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateLeaveRequestStatus(
  token: string,
  id: string,
  status: LeaveRequest['status'],
): Promise<{ ok: boolean; request: LeaveRequest }> {
  return apiJson(`/api/leave-requests/${encodeURIComponent(id)}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function cleanupLeaveRequestsForUsers(
  token: string,
  userIds: string[],
): Promise<{ ok: boolean; removed: number; remaining: number | null }> {
  return apiJson('/api/leave-requests/cleanup', token, {
    method: 'POST',
    body: JSON.stringify({ userIds }),
  });
}

export async function getSettings(token: string): Promise<Record<string, unknown>> {
  return apiJson('/api/settings', token);
}

export async function putSettingsBulk(
  token: string,
  settings: Record<string, unknown>,
): Promise<{ ok: boolean }> {
  return apiJson('/api/settings/bulk', token, {
    method: 'PUT',
    body: JSON.stringify({ settings }),
  });
}

export async function putRoleTemplates(
  token: string,
  roleTemplates: unknown[],
): Promise<{ ok: boolean; roleTemplates: unknown[] }> {
  return apiJson('/api/settings/role-templates', token, {
    method: 'PUT',
    body: JSON.stringify({ roleTemplates }),
  });
}

export async function addSettingsLookup(
  token: string,
  category: string,
  value: string,
): Promise<{ ok: boolean; category: string; value: string }> {
  return apiJson('/api/settings/lookups', token, {
    method: 'POST',
    body: JSON.stringify({ category, value }),
  });
}

export async function deleteSettingsLookup(
  token: string,
  category: string,
  value: string,
): Promise<{ ok: boolean; category: string; value: string; deleted?: number }> {
  return apiJson('/api/settings/lookups', token, {
    method: 'DELETE',
    body: JSON.stringify({ category, value }),
  });
}

// ----------------------------------------------------------------------------
// Phase 1 bulk delete + WhatsApp template endpoints. All cleanup routes are
// owner-only at the server (requireOwner middleware). Helpers return the
// server payload verbatim so specs can assert on { deleted, skipped } etc.
// ----------------------------------------------------------------------------

export type AttendanceRecord = {
  id?: string;
  userId: string;
  date: string;
  status?: string;
  checkIn?: string;
  checkOut?: string;
  note?: string;
  firstLoginAt?: string;
  lastLogoutAt?: string;
  updatedAt?: string;
  updatedBy?: string;
};

export async function fetchAttendanceRecords(
  token: string,
  startDate: string,
  endDate: string,
): Promise<AttendanceRecord[]> {
  const q = new URLSearchParams({ startDate, endDate });
  return apiJson(`/api/attendance/records?${q.toString()}`, token);
}

export async function upsertAttendanceRecords(
  token: string,
  records: AttendanceRecord[],
): Promise<{ ok: boolean; count: number }> {
  return apiJson('/api/attendance/records', token, {
    method: 'PUT',
    body: JSON.stringify({ records }),
  });
}

export async function cleanupAttendanceRange(
  token: string,
  startDate: string,
  endDate: string,
): Promise<{ ok: boolean; deleted: number; startDate: string; endDate: string }> {
  return apiJson('/api/attendance/cleanup', token, {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate }),
  });
}

export type LogEntry = {
  id: string;
  ts: string;
  actor: string;
  action: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
};

export async function listLogs(token: string, query = ''): Promise<LogEntry[]> {
  const qs = String(query || '').trim();
  return apiJson<LogEntry[]>(`/api/logs${qs ? (qs.startsWith('?') ? qs : `?${qs}`) : ''}`, token);
}

export async function replaceLogs(
  token: string,
  logs: LogEntry[],
): Promise<{ ok: boolean }> {
  return apiJson('/api/logs/bulk', token, {
    method: 'PUT',
    body: JSON.stringify({ logs }),
  });
}

export async function cleanupLogsRange(
  token: string,
  startDate: string,
  endDate: string,
): Promise<{ ok: boolean; deleted: number; remaining: number; startDate: string; endDate: string }> {
  return apiJson('/api/logs/cleanup', token, {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate }),
  });
}

export async function cleanupStaffUsers(
  token: string,
  userIds: string[],
): Promise<{ ok: boolean; deleted: string[]; skipped: Array<{ id: string; reason: string }>; reason?: string }> {
  return apiJson('/api/users/cleanup', token, {
    method: 'POST',
    body: JSON.stringify({ userIds }),
  });
}

export type WhatsappTemplatesResponse = {
  ok: boolean;
  gymCodeId?: string;
  templates: Record<string, string>;
  updatedAt: string | null;
};

export async function getWhatsappTemplates(
  token: string,
  gymCodeId: string,
): Promise<WhatsappTemplatesResponse> {
  const q = encodeURIComponent(gymCodeId);
  return apiJson<WhatsappTemplatesResponse>(`/api/whatsapp-templates?gymCodeId=${q}`, token);
}

export async function patchWhatsappTemplate(
  token: string,
  key: string,
  body: string,
  gymCodeId: string,
): Promise<{ ok: boolean; template: { key: string; body: string; updatedAt: string }; gymCodeId?: string }> {
  return apiJson(`/api/whatsapp-templates/${encodeURIComponent(key)}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ body, gymCodeId }),
  });
}

export type FinanceTransaction = {
  id: string;
  date: string;
  amount: number;
  type?: 'income' | 'expense';
  status?: 'success' | 'pending' | string;
  memberId?: string;
  memberName?: string;
  plan?: string;
  method?: string;
  note?: string;
};

export async function listFinance(token: string): Promise<FinanceTransaction[]> {
  return apiJson<FinanceTransaction[]>('/api/finance', token);
}

export async function replaceFinance(
  token: string,
  finance: FinanceTransaction[],
): Promise<{ ok: boolean }> {
  return apiJson('/api/finance/bulk', token, {
    method: 'PUT',
    body: JSON.stringify({ finance }),
  });
}
