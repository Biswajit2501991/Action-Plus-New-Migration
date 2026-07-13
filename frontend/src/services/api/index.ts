import { apiFetch } from "@/services/api/client";
import type {
  AppSettings,
  AttendanceNote,
  AttendanceRecord,
  AuditLog,
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
    apiFetch<{ ok?: boolean; photoUrl?: string }>(`/members/${encodeURIComponent(id)}/photo`, {
      method: "POST",
      body: JSON.stringify({ image }),
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
};

export const settingsApi = {
  get: () => apiFetch<AppSettings>("/settings"),
  bulk: (settings: AppSettings) =>
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

export const logsApi = {
  list: () => apiFetch<AuditLog[]>("/logs"),
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
  cleanup: () => apiFetch<{ ok?: boolean }>("/logs/cleanup", { method: "POST" }),
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
};

export const systemApi = {
  health: () => apiFetch<Record<string, unknown>>("/health"),
  version: () => apiFetch<Record<string, unknown>>("/version"),
  storage: () => apiFetch<Record<string, unknown>>("/storage"),
  backups: () => apiFetch<unknown[]>("/backups"),
  processStop: () => apiFetch<{ ok?: boolean }>("/process/stop", { method: "POST" }),
  processRestart: () => apiFetch<{ ok?: boolean }>("/process/restart", { method: "POST" }),
  processStart: () => apiFetch<{ ok?: boolean }>("/process/start", { method: "POST" }),
};

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
