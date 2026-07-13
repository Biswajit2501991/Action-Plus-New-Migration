import type { AccessMap, AuthUser } from "@/types";

export const ALL_SECTIONS = [
  "Dashboard",
  "Members",
  "PT Clients",
  "WhatsApp SMS",
  "Finance",
  "Staff",
  "Attendance",
  "Leave Tracker",
  "Settings",
  "Logs",
  "Support",
  "Backend",
] as const;

export type SectionName = (typeof ALL_SECTIONS)[number] | "Reports" | "Marketing" | "Inventory" | "Help";

export const DEFAULT_ACCESS: AccessMap = {
  dashboard: {
    viewDashboardCore: true,
    viewOverdueRetentionAlerts: true,
    viewRevenueMonthly: true,
    viewRevenueTrend: true,
    viewMembershipTrends: true,
  },
  finance: {
    viewRevenueAutoMembers: true,
    viewRevenueTrend4Months: true,
    viewPlanPopularity: true,
    viewTransactionsAutoMembers: true,
    viewPendingPayments: true,
    viewExpenseCard: true,
    viewProfitCard: true,
    manageExpenses: true,
  },
  settings: {
    managePlans: true,
    manageStatuses: true,
    managePaymentMethods: true,
    manageExpenseCategories: true,
    manageHoldDurations: true,
    manageGenders: true,
    viewBackendDiskUsage: true,
    manageFineRule: true,
  },
  whatsapp: {
    viewReminder: true,
    viewMonthReminder: true,
    viewSuccess: true,
    viewFine: true,
    viewDeactivate: true,
    viewHold: true,
    viewWelcome: true,
    viewTemplates: true,
  },
  leave: {
    viewCreateLeaveRequest: true,
    viewLeaveRequests: true,
    viewAnnualLeaveBalance: true,
    viewLeaveHistory: true,
  },
  members: {
    viewMembers: true,
    viewVisitors: true,
    addMembers: true,
    editMembers: true,
    deleteMembers: true,
  },
  ptClients: {
    viewPtClients: true,
    editPtPlan: true,
    editPtWorkout: true,
    uploadDietDocuments: true,
  },
  attendance: {
    viewAttendance: true,
    markAllPresent: true,
    editAttendance: true,
    submitOwnLateNote: true,
  },
  logs: {
    viewLogs: true,
    exportLogs: true,
    clearLogs: true,
  },
  support: {
    viewSupportTemplates: true,
    editSupportTemplates: true,
  },
  backend: {
    viewBackendPage: true,
    controlBackendProcesses: true,
  },
  paymentQr: {
    viewPaymentQr: true,
    managePaymentSettings: false,
  },
};

export function normalizeAccess(access?: AccessMap | null): AccessMap {
  const a = access || {};
  return {
    dashboard: {
      viewDashboardCore: a.dashboard?.viewDashboardCore !== false,
      viewOverdueRetentionAlerts: a.dashboard?.viewOverdueRetentionAlerts !== false,
      viewRevenueMonthly: a.dashboard?.viewRevenueMonthly !== false,
      viewRevenueTrend: a.dashboard?.viewRevenueTrend !== false,
      viewMembershipTrends: a.dashboard?.viewMembershipTrends !== false,
    },
    finance: {
      viewRevenueAutoMembers: a.finance?.viewRevenueAutoMembers !== false,
      viewRevenueTrend4Months: a.finance?.viewRevenueTrend4Months !== false,
      viewPlanPopularity: a.finance?.viewPlanPopularity !== false,
      viewTransactionsAutoMembers: a.finance?.viewTransactionsAutoMembers !== false,
      viewPendingPayments: a.finance?.viewPendingPayments !== false,
      viewExpenseCard: a.finance?.viewExpenseCard !== false,
      viewProfitCard: a.finance?.viewProfitCard !== false,
      manageExpenses: a.finance?.manageExpenses !== false,
    },
    settings: {
      managePlans: a.settings?.managePlans !== false,
      manageStatuses: a.settings?.manageStatuses !== false,
      managePaymentMethods: a.settings?.managePaymentMethods !== false,
      manageExpenseCategories: a.settings?.manageExpenseCategories !== false,
      manageHoldDurations: a.settings?.manageHoldDurations !== false,
      manageGenders: a.settings?.manageGenders !== false,
      viewBackendDiskUsage: a.settings?.viewBackendDiskUsage !== false,
      manageFineRule: a.settings?.manageFineRule !== false,
    },
    whatsapp: {
      viewReminder: a.whatsapp?.viewReminder !== false,
      viewMonthReminder: a.whatsapp?.viewMonthReminder !== false,
      viewSuccess: a.whatsapp?.viewSuccess !== false,
      viewFine: a.whatsapp?.viewFine !== false,
      viewDeactivate: a.whatsapp?.viewDeactivate !== false,
      viewHold: a.whatsapp?.viewHold !== false,
      viewWelcome: a.whatsapp?.viewWelcome !== false,
      viewTemplates: a.whatsapp?.viewTemplates !== false,
    },
    leave: {
      viewCreateLeaveRequest: a.leave?.viewCreateLeaveRequest !== false,
      viewLeaveRequests: a.leave?.viewLeaveRequests !== false,
      viewAnnualLeaveBalance: a.leave?.viewAnnualLeaveBalance !== false,
      viewLeaveHistory: a.leave?.viewLeaveHistory !== false,
    },
    members: {
      viewMembers: a.members?.viewMembers !== false,
      viewVisitors: a.members?.viewVisitors !== false,
      addMembers: a.members?.addMembers !== false,
      editMembers: a.members?.editMembers !== false,
      deleteMembers: a.members?.deleteMembers !== false,
    },
    ptClients: {
      viewPtClients: a.ptClients?.viewPtClients !== false,
      editPtPlan: a.ptClients?.editPtPlan !== false,
      editPtWorkout: a.ptClients?.editPtWorkout !== false,
      uploadDietDocuments: a.ptClients?.uploadDietDocuments !== false,
    },
    attendance: {
      viewAttendance: a.attendance?.viewAttendance !== false,
      markAllPresent: a.attendance?.markAllPresent !== false,
      editAttendance: a.attendance?.editAttendance !== false,
      submitOwnLateNote: a.attendance?.submitOwnLateNote !== false,
    },
    logs: {
      viewLogs: a.logs?.viewLogs !== false,
      exportLogs: a.logs?.exportLogs !== false,
      clearLogs: a.logs?.clearLogs !== false,
    },
    support: {
      viewSupportTemplates: a.support?.viewSupportTemplates !== false,
      editSupportTemplates: a.support?.editSupportTemplates !== false,
    },
    backend: {
      viewBackendPage: a.backend?.viewBackendPage !== false,
      controlBackendProcesses: a.backend?.controlBackendProcesses !== false,
    },
    paymentQr: {
      viewPaymentQr: a.paymentQr?.viewPaymentQr !== false,
      managePaymentSettings: a.paymentQr?.managePaymentSettings === true,
    },
  };
}

export function sectionsWithRoleDefaults(user: AuthUser | null | undefined): AuthUser | null {
  if (!user?.id) return user ?? null;
  const current = Array.isArray(user.sections) ? user.sections : [];
  let required: string[] = [];
  if (user.id === "owner") required = [...ALL_SECTIONS];
  if (user.id === "manager") {
    required = [
      "Dashboard",
      "Members",
      "PT Clients",
      "Finance",
      "Staff",
      "Attendance",
      "Leave Tracker",
      "Settings",
      "Logs",
    ];
  }
  if (user.id === "trainer") required = ["Dashboard", "Members", "PT Clients", "Attendance"];
  if (!required.length) return { ...user, access: normalizeAccess(user.access) };
  return {
    ...user,
    sections: Array.from(new Set([...current, ...required])),
    access: normalizeAccess(user.access),
  };
}

export function canAccessSection(user: AuthUser | null | undefined, section: string): boolean {
  if (!user) return false;
  if (user.id === "owner") return true;

  const sections = Array.isArray(user.sections) ? user.sections : [];
  const listed = sections.includes(section) || section === "Support" || section === "Logs";
  if (!listed) return false;

  if (section === "Attendance") return hasAccess(user, "attendance", "viewAttendance");
  if (section === "Logs") return hasAccess(user, "logs", "viewLogs");
  if (section === "Support") return hasAccess(user, "support", "viewSupportTemplates");
  if (section === "Backend") return hasAccess(user, "backend", "viewBackendPage");
  return true;
}

export function hasAccess(
  user: AuthUser | null | undefined,
  group: keyof AccessMap,
  key: string,
): boolean {
  if (!user) return false;
  if (user.id === "owner") return true;
  const access = normalizeAccess(user.access);
  return access[group]?.[key] !== false;
}

export function isMasterOwnerUser(user: AuthUser | null | undefined) {
  if (!user) return false;
  const id = String(user.id || "")
    .trim()
    .toLowerCase();
  const role = String(user.staffRole || user.role || "")
    .trim()
    .toLowerCase();
  if (id === "owner" || role === "owner" || role === "master_owner") return true;
  const roles = Array.isArray(user.roles) ? user.roles : [];
  return roles.some((r) => {
    const key = String(r || "")
      .trim()
      .toLowerCase();
    return key === "owner" || key === "master_owner";
  });
}

export function isBranchAdminUser(user: AuthUser | null | undefined) {
  if (!user) return false;
  if (isMasterOwnerUser(user)) return true;
  const role = String(user.staffRole || "")
    .trim()
    .toLowerCase();
  return role === "branch_owner";
}

export type RoleTemplate = {
  id: string;
  title: string;
  subtitle?: string;
  sections?: string[];
  color?: string;
};

export const DEFAULT_ROLE_TEMPLATES: RoleTemplate[] = [
  {
    id: "frontdesk",
    title: "Front Desk Manager",
    subtitle: "Member and Front Desk Ops",
    sections: [
      "Dashboard",
      "Members",
      "PT Clients",
      "WhatsApp SMS",
      "Finance",
      "Attendance",
      "Leave Tracker",
      "Settings",
    ],
    color: "border-amber-200 bg-amber-50",
  },
  {
    id: "trainer",
    title: "Trainer",
    subtitle: "Members & PT focus",
    sections: ["Dashboard", "Members", "PT Clients", "Attendance"],
    color: "border-sky-200 bg-sky-50",
  },
  {
    id: "manager",
    title: "Gym Manager",
    subtitle: "Ops without Backend",
    sections: [
      "Dashboard",
      "Members",
      "PT Clients",
      "WhatsApp SMS",
      "Finance",
      "Staff",
      "Attendance",
      "Leave Tracker",
      "Settings",
      "Logs",
    ],
    color: "border-emerald-200 bg-emerald-50",
  },
];
