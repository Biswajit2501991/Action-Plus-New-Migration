import { apiFetch } from "@/services/api/client";
import type {
  AppSettings,
  AttendanceNote,
  AttendanceRecord,
  AuditLog,
  BranchBrandingDto,
  FinanceSummary,
  FinanceTransaction,
  GymCode,
  LeaveRequest,
  Member,
  StaffUser,
  Visitor,
} from "@/types";

export const membersApi = {
  list: () => apiFetch<Member[]>("/members"),
  get: (id: string) => apiFetch<Member>(`/members/${encodeURIComponent(id)}`),
  bulk: (members: Member[]) =>
    apiFetch<{ ok?: boolean }>("/members/bulk", {
      method: "PUT",
      body: JSON.stringify({ members }),
    }),
  patch: (id: string, patch: Partial<Member>) =>
    apiFetch<{ ok?: boolean; member?: Member }>(`/members/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ patch }),
    }),
  remove: (id: string) =>
    apiFetch<{ ok?: boolean }>(`/members/${encodeURIComponent(id)}`, { method: "DELETE" }),
  addPayment: (id: string, payment: Record<string, unknown>) =>
    apiFetch<Member>(`/members/${encodeURIComponent(id)}/payments`, {
      method: "POST",
      body: JSON.stringify(payment),
    }),
  updatePayment: (id: string, paymentId: string, payment: Record<string, unknown>) =>
    apiFetch<Member>(`/members/${encodeURIComponent(id)}/payments/${encodeURIComponent(paymentId)}`, {
      method: "PATCH",
      body: JSON.stringify(payment),
    }),
  deletePayment: (id: string, paymentId: string) =>
    apiFetch<{ ok?: boolean }>(
      `/members/${encodeURIComponent(id)}/payments/${encodeURIComponent(paymentId)}`,
      { method: "DELETE" },
    ),
  setPaidForMonth: (id: string, monthKey: string, body: Record<string, unknown>) =>
    apiFetch<Member>(`/members/${encodeURIComponent(id)}/paid-for-month/${encodeURIComponent(monthKey)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  uploadPhoto: (id: string, image: string) =>
    apiFetch<{ ok?: boolean; photoUrl?: string; photoVersion?: number; member?: Member }>(
      `/members/${encodeURIComponent(id)}/photo`,
      {
        method: "POST",
        body: JSON.stringify({ image }),
      },
    ),
  /** Batch signed URLs for list avatars (prod Option A). */
  photoUrls: (memberIds: string[]) =>
    apiFetch<{ ok?: boolean; urls?: Array<{ memberId?: string; photoVersion?: number; url?: string }> }>(
      "/members/photo-urls",
      {
        method: "POST",
        body: JSON.stringify({ memberIds }),
      },
    ),
  deletePhoto: (id: string) =>
    apiFetch<{ ok?: boolean; member?: Member }>(`/members/${encodeURIComponent(id)}/photo`, {
      method: "DELETE",
    }),
};

export const visitorsApi = {
  list: () => apiFetch<Visitor[]>("/visitors"),
  bulk: (visitors: Visitor[]) =>
    apiFetch<{ ok?: boolean }>("/visitors/bulk", {
      method: "PUT",
      body: JSON.stringify({ visitors }),
    }),
  remove: (id: string) =>
    apiFetch<{ ok?: boolean }>(`/visitors/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

export const usersApi = {
  list: () => apiFetch<StaffUser[]>("/users"),
  bulk: (users: StaffUser[]) =>
    apiFetch<{ ok?: boolean }>("/users/bulk", {
      method: "PUT",
      body: JSON.stringify({ users }),
    }),
  /** Upsert one staff row (backend writeUsers is upsert-only). */
  upsert: (user: StaffUser) =>
    apiFetch<{ ok?: boolean }>("/users/bulk", {
      method: "PUT",
      body: JSON.stringify({ users: [sanitizeStaffForApi(user)] }),
    }),
  cleanup: (userIds: string[]) =>
    apiFetch<{
      ok?: boolean;
      deleted?: string[];
      deactivated?: string[];
      skipped?: Array<{ id?: string; reason?: string }>;
    }>("/users/cleanup", {
      method: "POST",
      body: JSON.stringify({ userIds }),
    }),
  uploadPhoto: (staffId: string, image: string) =>
    apiFetch<{ ok?: boolean; photoUrl?: string; photoVersion?: number; user?: StaffUser }>(
      `/users/${encodeURIComponent(staffId)}/photo`,
      {
        method: "POST",
        body: JSON.stringify({ image }),
      },
    ),
  /** Batch signed URLs for staff avatars (prod Option A — same bucket as members). */
  photoUrls: (staffIds: string[]) =>
    apiFetch<{
      ok?: boolean;
      urls?: Array<{ staffId?: string; id?: string; photoVersion?: number; url?: string }>;
    }>("/users/photo-urls", {
      method: "POST",
      body: JSON.stringify({ staffIds }),
    }),
  deletePhoto: (staffId: string) =>
    apiFetch<{ ok?: boolean; user?: StaffUser }>(`/users/${encodeURIComponent(staffId)}/photo`, {
      method: "DELETE",
    }),
};

function sanitizeStaffForApi(user: StaffUser) {
  const { password: _pw, photo: _photo, ...safe } = user as StaffUser & {
    password?: string;
    photo?: string;
  };
  return { ...safe, syncBranchAssignments: user.id !== "owner" };
}

export const settingsApi = {
  get: (scope?: "core" | "leave" | "pt" | "full") => {
    const qs = scope ? `?scope=${encodeURIComponent(scope)}` : "";
    return apiFetch<AppSettings>(`/settings${qs}`);
  },
  bulk: (settings: Partial<AppSettings>) =>
    apiFetch<{ ok?: boolean }>("/settings/bulk", {
      method: "PUT",
      body: JSON.stringify({ settings }),
    }),
  roleTemplates: (roleTemplates: unknown[]) =>
    apiFetch<{ ok?: boolean }>("/settings/role-templates", {
      method: "PUT",
      body: JSON.stringify({ roleTemplates }),
    }),
  addLookup: (category: string, value: string) =>
    apiFetch<{ ok?: boolean }>("/settings/lookups", {
      method: "POST",
      body: JSON.stringify({ category, value }),
    }),
  deleteLookup: (category: string, value: string) =>
    apiFetch<{ ok?: boolean }>("/settings/lookups", {
      method: "DELETE",
      body: JSON.stringify({ category, value }),
    }),
};

export const financeApi = {
  list: () => apiFetch<FinanceTransaction[]>("/finance"),
  summary: (month?: string) =>
    apiFetch<FinanceSummary & Record<string, unknown>>(
      `/finance/summary${month ? `?month=${encodeURIComponent(month)}` : ""}`,
    ),
  reconciliation: (year?: number) => {
    const y = year || new Date().getFullYear();
    return apiFetch<Record<string, unknown>>(
      `/finance/reconciliation?year=${encodeURIComponent(String(y))}`,
    );
  },
  addExpense: (expense: Record<string, unknown>) =>
    apiFetch<FinanceTransaction>("/finance/expenses", {
      method: "POST",
      body: JSON.stringify(expense),
    }),
  deleteExpense: (externalTxId: string) =>
    apiFetch<{ ok?: boolean }>(`/finance/expenses/${encodeURIComponent(externalTxId)}`, {
      method: "DELETE",
    }),
  bulk: (finance: FinanceTransaction[]) =>
    apiFetch<{ ok?: boolean }>("/finance/bulk", {
      method: "PUT",
      body: JSON.stringify({ finance }),
    }),
};

export const attendanceApi = {
  records: (params: { startDate: string; endDate: string }) => {
    const q = new URLSearchParams({
      startDate: params.startDate,
      endDate: params.endDate,
    });
    return apiFetch<AttendanceRecord[]>(`/attendance/records?${q.toString()}`);
  },
  selfToday: async () => {
    const res = await apiFetch<{ ok?: boolean; record?: AttendanceRecord | null }>(
      "/attendance/records/self/today",
    );
    return res?.record ?? null;
  },
  punch: async (body: {
    type: "login" | "logout";
    at?: string;
    timeZone?: string;
    actorName?: string;
  }) => {
    const res = await apiFetch<{ ok?: boolean; record?: AttendanceRecord }>(
      "/attendance/punch",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
    return res?.record ?? null;
  },
  saveRecords: (records: AttendanceRecord[]) =>
    apiFetch<{ ok?: boolean; count?: number }>("/attendance/records", {
      method: "PUT",
      body: JSON.stringify({ records }),
    }),
  cleanup: (body: { startDate: string; endDate: string }) =>
    apiFetch<{ ok?: boolean; deleted?: number; startDate?: string; endDate?: string }>(
      "/attendance/cleanup",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),
  addNote: async (body: Record<string, unknown>) => {
    const res = await apiFetch<{ ok?: boolean; note?: AttendanceNote }>("/attendance/notes", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return res?.note ?? null;
  },
  notes: async (params?: { startDate?: string; endDate?: string; staffLoginId?: string }) => {
    const q = new URLSearchParams();
    if (params?.startDate) q.set("startDate", params.startDate);
    if (params?.endDate) q.set("endDate", params.endDate);
    if (params?.staffLoginId) q.set("staffLoginId", params.staffLoginId);
    const qs = q.toString();
    const res = await apiFetch<{ ok?: boolean; notes?: AttendanceNote[] }>(
      `/attendance/notes${qs ? `?${qs}` : ""}`,
    );
    return Array.isArray(res?.notes) ? res.notes : [];
  },
  latestNote: async (params?: { date?: string; staffLoginId?: string }) => {
    const q = new URLSearchParams();
    if (params?.date) q.set("date", params.date);
    if (params?.staffLoginId) q.set("staffLoginId", params.staffLoginId);
    const qs = q.toString();
    const res = await apiFetch<{ ok?: boolean; note?: AttendanceNote | null }>(
      `/attendance/notes/latest${qs ? `?${qs}` : ""}`,
    );
    return res?.note ?? null;
  },
};

export const leaveApi = {
  create: async (body: Record<string, unknown>) => {
    const res = await apiFetch<{ ok?: boolean; request?: LeaveRequest }>("/leave-requests", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return res?.request ?? (res as unknown as LeaveRequest);
  },
  update: async (id: string, body: Record<string, unknown>) => {
    const res = await apiFetch<{ ok?: boolean; request?: LeaveRequest }>(
      `/leave-requests/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    );
    return res?.request ?? (res as unknown as LeaveRequest);
  },
  balances: (year?: number) => {
    const y = year || new Date().getFullYear();
    return apiFetch<{
      calendarYear?: number;
      baseDays?: number;
      adjustments?: unknown[];
      rows?: Array<{
        userId?: string;
        name?: string;
        balance?: number;
        staffLoginId?: string;
        staffName?: string;
        baseDays?: number;
        usedDays?: number;
        remainingDays?: number;
        adjustmentDays?: number;
      }>;
    }>(`/leave-balance?year=${encodeURIComponent(String(y))}`);
  },
};

export const AUDIT_LOGS_PAGE_SIZE = 1000;
export const AUDIT_LOGS_LIST_LIMIT = 25000;

export const logsApi = {
  list: (params?: {
    view?: string;
    days?: number;
    limit?: number;
    offset?: number;
  }) => {
    const q = new URLSearchParams();
    q.set("view", params?.view || "list");
    q.set("days", String(params?.days ?? 2555));
    q.set("limit", String(params?.limit ?? AUDIT_LOGS_LIST_LIMIT));
    if (params?.offset != null) q.set("offset", String(params.offset));
    return apiFetch<AuditLog[]>(`/logs?${q.toString()}`);
  },
  /** Paginated fetch matching prod Audit Command Center load. */
  listAll: async (opts?: { days?: number; limit?: number }) => {
    const requestedLimit = Math.min(opts?.limit ?? AUDIT_LOGS_LIST_LIMIT, 50000);
    const days = opts?.days ?? 2555;
    const pageSize = AUDIT_LOGS_PAGE_SIZE;
    const maxPages = Math.ceil(requestedLimit / pageSize) + 1;
    let offset = 0;
    const all: AuditLog[] = [];
    for (let page = 0; page < maxPages && all.length < requestedLimit; page += 1) {
      const batch = await logsApi.list({
        view: "list",
        days,
        limit: requestedLimit,
        offset,
      });
      if (!Array.isArray(batch) || batch.length === 0) break;
      all.push(...batch);
      if (all.length >= requestedLimit) break;
      if (batch.length < pageSize) break;
      offset += batch.length;
    }
    return all.length > requestedLimit ? all.slice(0, requestedLimit) : all;
  },
  get: (logId: string) => apiFetch<AuditLog>(`/logs/${encodeURIComponent(logId)}`),
  create: (log: Partial<AuditLog>) =>
    apiFetch<AuditLog>("/logs", {
      method: "POST",
      body: JSON.stringify(log),
    }),
  bulk: (logs: AuditLog[]) =>
    apiFetch<{ ok?: boolean }>("/logs/bulk", {
      method: "PUT",
      body: JSON.stringify({ logs }),
    }),
  cleanup: (range: { startDate: string; endDate: string }) =>
    apiFetch<{
      ok?: boolean;
      deleted?: number;
      remaining?: number;
      startDate?: string;
      endDate?: string;
    }>("/logs/cleanup", {
      method: "POST",
      body: JSON.stringify(range),
    }),
};

export type WhatsappTemplatesResponse = {
  ok?: boolean;
  gymCodeId?: string;
  templates?: Record<string, unknown>;
  updatedAt?: string | null;
};

export const whatsappApi = {
  templates: (gymCodeId?: string) => {
    const qs = gymCodeId ? `?gymCodeId=${encodeURIComponent(gymCodeId)}` : "";
    return apiFetch<WhatsappTemplatesResponse>(`/whatsapp-templates${qs}`);
  },
  patchTemplate: (key: string, body: Record<string, unknown>) =>
    apiFetch<unknown>(`/whatsapp-templates/${encodeURIComponent(key)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  customTemplates: () => apiFetch<unknown[]>("/custom-templates"),
  createCustom: (body: Record<string, unknown>) =>
    apiFetch<unknown>("/custom-templates", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  smsEvents: () => apiFetch<unknown[]>("/sms-events"),
  saveSmsEvents: (events: unknown[]) =>
    apiFetch<{ ok?: boolean }>("/sms-events/bulk", {
      method: "PUT",
      body: JSON.stringify({ events }),
    }),
};

export const ptApi = {
  patchProfile: (
    memberId: string,
    profile: Record<string, unknown>,
    mode: "workout" | "plan" = "workout",
  ) =>
    apiFetch<{ ok?: boolean; memberId?: string; profile?: Record<string, unknown> }>(
      "/pt-client-profiles",
      {
        method: "PATCH",
        body: JSON.stringify({ memberId, profile, mode }),
      },
    ),
};

export const gymCodesApi = {
  list: () => apiFetch<GymCode[]>("/gym-codes"),
  create: (body: { code: string; name?: string; branchName?: string }) =>
    apiFetch<GymCode>("/gym-codes", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateShift: (
    id: string,
    body: { shiftStartTime?: string | null; shiftTimezone?: string | null },
  ) =>
    apiFetch<{ ok?: boolean; gymCode?: GymCode }>(`/gym-codes/${encodeURIComponent(id)}/shift`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  getBranding: (id: string) =>
    apiFetch<{ ok?: boolean; branding?: BranchBrandingDto }>(
      `/gym-codes/${encodeURIComponent(id)}/branding`,
    ),
  updateBranding: (id: string, body: { displayName?: string; clearLogo?: boolean }) =>
    apiFetch<{ ok?: boolean; branding?: BranchBrandingDto }>(
      `/gym-codes/${encodeURIComponent(id)}/branding`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    ),
  uploadLogo: (id: string, logo: string) =>
    apiFetch<{ ok?: boolean; branding?: BranchBrandingDto }>(
      `/gym-codes/${encodeURIComponent(id)}/branding/logo`,
      {
        method: "POST",
        body: JSON.stringify({ logo }),
      },
    ),
  remove: (id: string) =>
    apiFetch<void>(`/gym-codes/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

export const brandingApi = {
  active: () => apiFetch<{ ok?: boolean; branding?: BranchBrandingDto }>("/branding/active"),
  branches: () =>
    apiFetch<{ ok?: boolean; branches?: BranchBrandingDto[] }>("/branding/branches"),
};

export type StorageUsage = {
  dbBytes?: number;
  backupsBytes?: number;
  backupFileCount?: number;
  totalBytes?: number;
  [key: string]: unknown;
};

export const systemApi = {
  health: () => apiFetch<Record<string, unknown>>("/health", {}, { skipAuth: true }),
  version: () => apiFetch<Record<string, unknown>>("/version"),
  storage: () => apiFetch<StorageUsage>("/storage"),
  backups: () => apiFetch<{ backups?: string[] }>("/backups"),
  restoreBackup: (fileName: string) =>
    apiFetch<{ ok?: boolean; fileName?: string }>("/backups/restore", {
      method: "POST",
      body: JSON.stringify({ fileName }),
    }),
  deleteBackup: (fileName: string) =>
    apiFetch<{ ok?: boolean; backups?: string[]; storage?: StorageUsage }>(
      `/backups/${encodeURIComponent(fileName)}`,
      { method: "DELETE" },
    ),
  pruneBackups: (days: number) =>
    apiFetch<{ ok?: boolean; backups?: string[]; storage?: StorageUsage }>(
      "/backups/prune-older",
      {
        method: "POST",
        body: JSON.stringify({ days }),
      },
    ),
  keepLatestBackups: (count: number) =>
    apiFetch<{ ok?: boolean; backups?: string[]; storage?: StorageUsage }>(
      "/backups/keep-latest",
      {
        method: "POST",
        body: JSON.stringify({ count }),
      },
    ),
  processStop: () => apiFetch<{ ok?: boolean }>("/process/stop", { method: "POST" }),
  processRestart: () => apiFetch<{ ok?: boolean }>("/process/restart", { method: "POST" }),
  processStart: () => apiFetch<{ ok?: boolean }>("/process/start", { method: "POST" }),
};

/** Local supervisor base URL (prod process control path). */
export function getSupervisorBaseUrl(): string {
  if (typeof window === "undefined") return "";
  const rel = process.env.NEXT_PUBLIC_SUPERVISOR_RELATIVE || "";
  if (rel && window.location?.origin?.startsWith("http")) {
    const path = rel.startsWith("/") ? rel : `/${rel}`;
    return `${window.location.origin}${path}`.replace(/\/$/, "");
  }
  const fromEnv = process.env.NEXT_PUBLIC_SUPERVISOR_URL || "";
  if (fromEnv) return String(fromEnv).replace(/\/$/, "");
  const h = window.location.hostname;
  if (h === "localhost" || h === "127.0.0.1") return "http://127.0.0.1:4010";
  return "";
}

export type PaymentQrItem = {
  id: string;
  qrName?: string;
  branchLabel?: string;
  gymCodeId?: string;
  qrImageUrl?: string;
  isActive?: boolean;
  displayOrder?: number;
  [key: string]: unknown;
};

export const paymentQrApi = {
  list: (params?: { gymCodeId?: string; activeOnly?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.gymCodeId) q.set("gymCodeId", params.gymCodeId);
    if (params?.activeOnly === false) q.set("activeOnly", "false");
    const qs = q.toString();
    return apiFetch<{ ok?: boolean; gymCodeId?: string; items?: PaymentQrItem[] }>(
      `/payment-qr${qs ? `?${qs}` : ""}`,
    );
  },
};
