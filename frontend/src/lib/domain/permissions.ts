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

export type AccessChildPermission = { key: string; label: string };

export const DASHBOARD_CHILD_PERMISSIONS: AccessChildPermission[] = [
  { key: "viewDashboardCore", label: "Active / Hold / Deactivated / Cancelled + Filter + Add New Member" },
  { key: "viewOverdueRetentionAlerts", label: "Overdue Payments and Retention Alerts" },
  { key: "viewRevenueMonthly", label: "Total Revenue (Monthly)" },
  { key: "viewRevenueTrend", label: "Revenue Trend" },
  { key: "viewMembershipTrends", label: "Membership Trends" },
];

export const FINANCE_CHILD_PERMISSIONS: AccessChildPermission[] = [
  { key: "viewRevenueAutoMembers", label: "Finance — Revenue (Auto from Members)" },
  { key: "viewPendingPayments", label: "Finance — Pending Payments Card" },
  { key: "viewExpenseCard", label: "Finance — Expenses Card" },
  { key: "viewProfitCard", label: "Finance — Profit Card" },
  { key: "viewYtdCollected", label: "Finance — YTD Collected" },
  { key: "viewRevenueTrend4Months", label: "Revenue Trend (Last 4 Months)" },
  { key: "viewPlanPopularity", label: "Plan Popularity" },
  { key: "viewTransactionsAutoMembers", label: "Transactions (Auto from Members)" },
  { key: "manageExpenses", label: "Add / Edit Expense Entries" },
];

export const SETTINGS_CHILD_PERMISSIONS: AccessChildPermission[] = [
  { key: "managePlans", label: "Plans" },
  { key: "manageStatuses", label: "Statuses" },
  { key: "managePaymentMethods", label: "Payment Methods" },
  { key: "manageExpenseCategories", label: "Expense Categories" },
  { key: "manageHoldDurations", label: "Hold Durations" },
  { key: "manageGenders", label: "Genders" },
  { key: "viewBackendDiskUsage", label: "Disk Usage (Backend)" },
  { key: "manageFineRule", label: "Fine SMS Rule" },
];

export const WHATSAPP_CHILD_PERMISSIONS: AccessChildPermission[] = [
  { key: "viewReminder", label: "Reminder" },
  { key: "viewMonthReminder", label: "Month-Based Reminder" },
  { key: "viewSuccess", label: "Success SMS" },
  { key: "viewFine", label: "Fine SMS" },
  { key: "viewDeactivate", label: "Deactivate SMS" },
  { key: "viewHold", label: "Hold SMS" },
  { key: "viewWelcome", label: "Welcome SMS" },
  { key: "viewTemplates", label: "WhatsApp Template" },
];

export const LEAVE_CHILD_PERMISSIONS: AccessChildPermission[] = [
  { key: "viewCreateLeaveRequest", label: "Create Leave Request" },
  { key: "viewLeaveRequests", label: "Leave Requests (approve/reject if eligible)" },
  { key: "viewAnnualLeaveBalance", label: "Annual Leave Balance" },
  { key: "viewLeaveHistory", label: "Leave History (Last 2 Years)" },
];

export const MEMBERS_CHILD_PERMISSIONS: AccessChildPermission[] = [
  { key: "viewMembers", label: "View Members" },
  { key: "viewVisitors", label: "View Visitors" },
  { key: "addMembers", label: "Add Members" },
  { key: "editMembers", label: "Edit Members" },
  { key: "deleteMembers", label: "Delete Members" },
];

export const PT_CLIENTS_CHILD_PERMISSIONS: AccessChildPermission[] = [
  { key: "viewPtClients", label: "View PT Clients" },
  { key: "editPtPlan", label: "Edit PT Plan" },
  { key: "editPtWorkout", label: "Edit PT Workout" },
  { key: "uploadDietDocuments", label: "Upload Diet Documents" },
];

export const ATTENDANCE_CHILD_PERMISSIONS: AccessChildPermission[] = [
  { key: "viewAttendance", label: "View Attendance Dashboard" },
  { key: "markAllPresent", label: "Mark All Present" },
  { key: "editAttendance", label: "Edit Status / Notes" },
  { key: "submitOwnLateNote", label: "Submit own late-arrival note (no Attendance tab required)" },
];

export const LOGS_CHILD_PERMISSIONS: AccessChildPermission[] = [
  { key: "viewLogs", label: "View Audit Logs" },
  { key: "exportLogs", label: "Export Logs CSV" },
  { key: "clearLogs", label: "Clear Logs" },
];

export const SUPPORT_CHILD_PERMISSIONS: AccessChildPermission[] = [
  { key: "viewSupportTemplates", label: "View Support Templates" },
  { key: "editSupportTemplates", label: "Edit / Save Support Templates" },
];

export const BACKEND_CHILD_PERMISSIONS: AccessChildPermission[] = [
  { key: "viewBackendPage", label: "View Backend Section" },
  { key: "controlBackendProcesses", label: "Restart / Turn On / Turn Off Backend" },
];

export const PAYMENT_QR_CHILD_PERMISSIONS: AccessChildPermission[] = [
  { key: "viewPaymentQr", label: "View Payment QR (Members toolbar)" },
  { key: "managePaymentSettings", label: "Manage Payment Settings (Owner)" },
];

/** Attendance tab visibility — late-note self-submit does not require the tab. */
export const ATTENDANCE_SECTION_PERMISSION_KEYS = [
  "viewAttendance",
  "markAllPresent",
  "editAttendance",
] as const;

export type SectionAccessConfig = {
  section: (typeof ALL_SECTIONS)[number];
  accessGroup: keyof AccessMap | null;
  children: AccessChildPermission[];
  /** Extra child groups shown under the same expand panel (e.g. Payment QR under Members). */
  extraGroups?: Array<{ group: keyof AccessMap; children: AccessChildPermission[]; title: string }>;
  /** Keys that keep the section listed (Attendance excludes submitOwnLateNote). */
  sectionKeys?: readonly string[];
};

export const SECTION_ACCESS_CONFIG: SectionAccessConfig[] = [
  { section: "Dashboard", accessGroup: "dashboard", children: DASHBOARD_CHILD_PERMISSIONS },
  {
    section: "Members",
    accessGroup: "members",
    children: MEMBERS_CHILD_PERMISSIONS,
    extraGroups: [
      { group: "paymentQr", children: PAYMENT_QR_CHILD_PERMISSIONS, title: "Payment QR" },
    ],
  },
  { section: "PT Clients", accessGroup: "ptClients", children: PT_CLIENTS_CHILD_PERMISSIONS },
  { section: "WhatsApp SMS", accessGroup: "whatsapp", children: WHATSAPP_CHILD_PERMISSIONS },
  { section: "Finance", accessGroup: "finance", children: FINANCE_CHILD_PERMISSIONS },
  { section: "Staff", accessGroup: null, children: [] },
  {
    section: "Attendance",
    accessGroup: "attendance",
    children: ATTENDANCE_CHILD_PERMISSIONS,
    sectionKeys: ATTENDANCE_SECTION_PERMISSION_KEYS,
  },
  { section: "Leave Tracker", accessGroup: "leave", children: LEAVE_CHILD_PERMISSIONS },
  { section: "Settings", accessGroup: "settings", children: SETTINGS_CHILD_PERMISSIONS },
  { section: "Logs", accessGroup: "logs", children: LOGS_CHILD_PERMISSIONS },
  { section: "Support", accessGroup: "support", children: SUPPORT_CHILD_PERMISSIONS },
  { section: "Backend", accessGroup: "backend", children: BACKEND_CHILD_PERMISSIONS },
];

function setGroupKeys(
  group: Record<string, boolean> | undefined,
  children: AccessChildPermission[],
  value: boolean,
  preserve?: Record<string, boolean>,
) {
  const next: Record<string, boolean> = { ...(group || {}) };
  for (const child of children) {
    if (preserve && Object.prototype.hasOwnProperty.call(preserve, child.key)) {
      next[child.key] = preserve[child.key];
    } else {
      next[child.key] = value;
    }
  }
  return next;
}

export type StaffAccessFormSlice = {
  sections: string[];
  access: AccessMap;
};

/** Parent section checkbox — syncs sections[] and all child access keys. */
export function toggleAccessParent(
  form: StaffAccessFormSlice,
  section: string,
): StaffAccessFormSlice {
  const cfg = SECTION_ACCESS_CONFIG.find((c) => c.section === section);
  const hasSection = form.sections.includes(section);
  const nextSections = hasSection
    ? form.sections.filter((s) => s !== section)
    : [...form.sections, section];

  if (!cfg?.accessGroup) {
    return { ...form, sections: nextSections };
  }

  const normalized = normalizeAccess(form.access);
  const group = cfg.accessGroup;
  const turningOff = hasSection;
  const preserve =
    group === "attendance" && turningOff
      ? { submitOwnLateNote: normalized.attendance?.submitOwnLateNote !== false }
      : undefined;

  const nextGroup = setGroupKeys(
    normalized[group] as Record<string, boolean>,
    cfg.children,
    !turningOff,
    preserve,
  );

  let nextAccess: AccessMap = {
    ...normalized,
    [group]: nextGroup,
  };

  if (cfg.extraGroups?.length) {
    for (const extra of cfg.extraGroups) {
      nextAccess = {
        ...nextAccess,
        [extra.group]: setGroupKeys(
          normalized[extra.group] as Record<string, boolean>,
          extra.children,
          !turningOff,
        ),
      };
    }
  }

  return { sections: nextSections, access: nextAccess };
}

/** Child permission checkbox — keeps section listed while any relevant child is on. */
export function toggleAccessChild(
  form: StaffAccessFormSlice,
  group: keyof AccessMap,
  key: string,
  section: string,
): StaffAccessFormSlice {
  const cfg = SECTION_ACCESS_CONFIG.find((c) => c.section === section);
  const normalized = normalizeAccess(form.access);
  const currentGroup = { ...(normalized[group] as Record<string, boolean>) };
  const currentlyOn =
    group === "paymentQr" && key === "managePaymentSettings"
      ? currentGroup[key] === true
      : currentGroup[key] !== false;
  currentGroup[key] = !currentlyOn;

  const nextAccess: AccessMap = { ...normalized, [group]: currentGroup };
  const primaryGroup = cfg?.accessGroup;
  let shouldEnable = false;

  if (primaryGroup) {
    const primary = nextAccess[primaryGroup] as Record<string, boolean>;
    if (cfg?.sectionKeys?.length) {
      shouldEnable = cfg.sectionKeys.some((k) => primary?.[k] !== false);
    } else {
      shouldEnable = Object.values(primary || {}).some(Boolean);
    }
  }

  const hasSection = form.sections.includes(section);
  const nextSections = shouldEnable
    ? hasSection
      ? form.sections
      : [...form.sections, section]
    : form.sections.filter((s) => s !== section);

  return { sections: nextSections, access: nextAccess };
}

export function toggleAllSectionsAccess(form: StaffAccessFormSlice): StaffAccessFormSlice {
  const allSelected = ALL_SECTIONS.every((sec) => form.sections.includes(sec));
  if (!allSelected) {
    return {
      sections: [...ALL_SECTIONS],
      access: normalizeAccess(DEFAULT_ACCESS),
    };
  }
  return {
    sections: [],
    access: normalizeAccess({
      dashboard: {
        viewDashboardCore: false,
        viewOverdueRetentionAlerts: false,
        viewRevenueMonthly: false,
        viewRevenueTrend: false,
        viewMembershipTrends: false,
      },
      finance: {
        viewRevenueAutoMembers: false,
        viewPendingPayments: false,
        viewExpenseCard: false,
        viewProfitCard: false,
        viewYtdCollected: false,
        viewRevenueTrend4Months: false,
        viewPlanPopularity: false,
        viewTransactionsAutoMembers: false,
        manageExpenses: false,
      },
      settings: {
        managePlans: false,
        manageStatuses: false,
        managePaymentMethods: false,
        manageExpenseCategories: false,
        manageHoldDurations: false,
        manageGenders: false,
        viewBackendDiskUsage: false,
        manageFineRule: false,
      },
      whatsapp: {
        viewReminder: false,
        viewMonthReminder: false,
        viewSuccess: false,
        viewFine: false,
        viewDeactivate: false,
        viewHold: false,
        viewWelcome: false,
        viewTemplates: false,
      },
      leave: {
        viewCreateLeaveRequest: false,
        viewLeaveRequests: false,
        viewAnnualLeaveBalance: false,
        viewLeaveHistory: false,
      },
      members: {
        viewMembers: false,
        viewVisitors: false,
        addMembers: false,
        editMembers: false,
        deleteMembers: false,
      },
      ptClients: {
        viewPtClients: false,
        editPtPlan: false,
        editPtWorkout: false,
        uploadDietDocuments: false,
      },
      attendance: {
        viewAttendance: false,
        markAllPresent: false,
        editAttendance: false,
        submitOwnLateNote: true,
      },
      logs: { viewLogs: false, exportLogs: false, clearLogs: false },
      support: { viewSupportTemplates: false, editSupportTemplates: false },
      backend: { viewBackendPage: false, controlBackendProcesses: false },
      paymentQr: { viewPaymentQr: false, managePaymentSettings: false },
    }),
  };
}

export function isAccessChildEnabled(access: AccessMap, group: keyof AccessMap, key: string) {
  const normalized = normalizeAccess(access);
  if (group === "paymentQr" && key === "managePaymentSettings") {
    return normalized.paymentQr?.managePaymentSettings === true;
  }
  return (normalized[group] as Record<string, boolean> | undefined)?.[key] !== false;
}

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
    viewYtdCollected: true,
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
      viewYtdCollected: a.finance?.viewYtdCollected !== false,
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
