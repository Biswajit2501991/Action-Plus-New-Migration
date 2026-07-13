import { apiFetch } from "@/services/api/client";
import type {
  AppSettings,
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
    apiFetch<Member>(`/members/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
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
    apiFetch<FinanceSummary>(`/finance/summary${month ? `?month=${encodeURIComponent(month)}` : ""}`),
  reconciliation: (month?: string) =>
    apiFetch<unknown>(`/finance/reconciliation${month ? `?month=${encodeURIComponent(month)}` : ""}`),
  addExpense: (expense: Record<string, unknown>) =>
    apiFetch<FinanceTransaction>("/finance/expenses", {
      method: "POST",
      body: JSON.stringify(expense),
    }),
  deleteExpense: (externalTxId: string) =>
    apiFetch<{ ok?: boolean }>(`/finance/expenses/${encodeURIComponent(externalTxId)}`, {
      method: "DELETE",
    }),
  bulk: (transactions: FinanceTransaction[]) =>
    apiFetch<{ ok?: boolean }>("/finance/bulk", {
      method: "PUT",
      body: JSON.stringify({ transactions }),
    }),
};

export const attendanceApi = {
  records: (params?: { from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (params?.from) q.set("from", params.from);
    if (params?.to) q.set("to", params.to);
    const qs = q.toString();
    return apiFetch<AttendanceRecord[]>(`/attendance/records${qs ? `?${qs}` : ""}`);
  },
  selfToday: () => apiFetch<AttendanceRecord>("/attendance/records/self/today"),
  punch: (body: Record<string, unknown>) =>
    apiFetch<AttendanceRecord>("/attendance/punch", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  saveRecords: (records: AttendanceRecord[]) =>
    apiFetch<{ ok?: boolean }>("/attendance/records", {
      method: "PUT",
      body: JSON.stringify({ records }),
    }),
  addNote: (body: Record<string, unknown>) =>
    apiFetch<unknown>("/attendance/notes", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  notes: () => apiFetch<unknown[]>("/attendance/notes"),
};

export const leaveApi = {
  create: (body: Record<string, unknown>) =>
    apiFetch<LeaveRequest>("/leave-requests", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  update: (id: string, body: Record<string, unknown>) =>
    apiFetch<LeaveRequest>(`/leave-requests/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
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

export const whatsappApi = {
  templates: () => apiFetch<Record<string, unknown>>("/whatsapp-templates"),
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
  patchProfiles: (profiles: Record<string, unknown>) =>
    apiFetch<unknown>("/pt-client-profiles", {
      method: "PATCH",
      body: JSON.stringify(profiles),
    }),
  patchProfile: (id: string, body: Record<string, unknown>) =>
    apiFetch<unknown>(`/pt-client-profiles/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
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

export const paymentQrApi = {
  list: () => apiFetch<unknown[]>("/payment-qr"),
};
