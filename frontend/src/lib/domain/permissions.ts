import type { AccessMap, AuthUser } from "@/types";

export const ALL_SECTIONS = [
  "Dashboard",
  "Members",
  "PT Clients",
  "WhatsApp SMS",
  "Finance",
  "Staff",
  "Website",
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
  { key: "viewAppearance", label: "Appearance" },
  { key: "manageGymBranches", label: "Gym Branches" },
  { key: "manageFineRule", label: "Fine SMS Rule" },
  { key: "manageSystemFeatures", label: "System Features" },
  { key: "managePlans", label: "Plans" },
  { key: "manageStatuses", label: "Statuses" },
  { key: "managePaymentMethods", label: "Payment Methods" },
  { key: "manageExpenseCategories", label: "Expense Categories" },
  { key: "manageHoldDurations", label: "Hold Durations" },
  { key: "manageGenders", label: "Genders" },
  { key: "manageExerciseTypes", label: "Exercise Types" },
  { key: "manageSettingsBackup", label: "Settings backup & recovery" },
  { key: "viewBackendDiskUsage", label: "Disk Usage (Backend)" },
];

/** Owner-grade Settings areas — off unless explicitly granted to staff. */
export const SETTINGS_OPT_IN_KEYS = new Set([
  "manageGymBranches",
  "manageSystemFeatures",
  "manageSettingsBackup",
]);

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

export const WEBSITE_CHILD_PERMISSIONS: AccessChildPermission[] = [
  { key: "viewWebsite", label: "Web view — sections & access" },
];

export const PAYMENT_QR_CHILD_PERMISSIONS: AccessChildPermission[] = [
  { key: "viewPaymentQr", label: "View Payment QR (Members toolbar)" },
  { key: "managePaymentSettings", label: "Manage Payment Settings (Owner)" },
];

/** Primary mobile bottom tabs + More entry (independent of web sections). */
export const MOBILE_TAB_PERMISSIONS: AccessChildPermission[] = [
  { key: "viewHome", label: "Home (Dashboard)" },
  { key: "viewMembers", label: "Members" },
  { key: "viewPt", label: "PT Clients" },
  { key: "viewStaff", label: "Staff" },
  { key: "viewLeave", label: "Leave Tracker" },
  { key: "viewMore", label: "More menu" },
];

/** Cards / actions inside mobile Home & Members & Leave. */
export const MOBILE_FEATURE_PERMISSIONS: AccessChildPermission[] = [
  { key: "homeCoreStats", label: "Home — Status tiles (Active / Hold / …)" },
  { key: "homeRevenue", label: "Home — Collected revenue card" },
  { key: "homeOverdue", label: "Home — Overdue payments list" },
  { key: "membersAdd", label: "Members — Add member" },
  { key: "membersEdit", label: "Members — Edit member" },
  {
    key: "membersExpand",
    label: "Members — Expand card (show mobile number & private details)",
  },
  { key: "leaveCreate", label: "Leave — Create request" },
  { key: "leaveApprove", label: "Leave — Approve / reject" },
];

/** Modules listed under mobile More (separate from web section access). */
export const MOBILE_MORE_PERMISSIONS: AccessChildPermission[] = [
  { key: "moreFinance", label: "More — Finance" },
  { key: "moreWhatsapp", label: "More — WhatsApp SMS" },
  { key: "moreAttendance", label: "More — Attendance" },
  { key: "moreSettings", label: "More — Settings" },
  { key: "moreLogs", label: "More — Logs" },
  { key: "moreSupport", label: "More — Support" },
  { key: "moreBackend", label: "More — Backend" },
];

export const ALL_MOBILE_PERMISSIONS: AccessChildPermission[] = [
  ...MOBILE_TAB_PERMISSIONS,
  ...MOBILE_FEATURE_PERMISSIONS,
  ...MOBILE_MORE_PERMISSIONS,
];

const DEFAULT_MOBILE_ACCESS: Record<string, boolean> = Object.fromEntries(
  ALL_MOBILE_PERMISSIONS.map((p) => [p.key, true]),
);

const DENIED_MOBILE_ACCESS: Record<string, boolean> = Object.fromEntries(
  ALL_MOBILE_PERMISSIONS.map((p) => [p.key, false]),
);

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
    section: "Website",
    accessGroup: "website",
    children: WEBSITE_CHILD_PERMISSIONS,
  },
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
  const currentMobile = normalizeAccess(form.access).mobile;
  if (!allSelected) {
    return {
      sections: [...ALL_SECTIONS],
      access: { ...normalizeAccess(DEFAULT_ACCESS), mobile: currentMobile },
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
        viewAppearance: false,
        manageGymBranches: false,
        manageFineRule: false,
        manageSystemFeatures: false,
        managePlans: false,
        manageStatuses: false,
        managePaymentMethods: false,
        manageExpenseCategories: false,
        manageHoldDurations: false,
        manageGenders: false,
        manageExerciseTypes: false,
        manageSettingsBackup: false,
        viewBackendDiskUsage: false,
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
      mobile: currentMobile,
    }),
  };
}

export function isAccessChildEnabled(access: AccessMap, group: keyof AccessMap, key: string) {
  const normalized = normalizeAccess(access);
  if (group === "paymentQr" && key === "managePaymentSettings") {
    return normalized.paymentQr?.managePaymentSettings === true;
  }
  if (group === "website" && key === "viewWebsite") {
    return normalized.website?.viewWebsite === true;
  }
  if (group === "settings" && SETTINGS_OPT_IN_KEYS.has(key)) {
    return normalized.settings?.[key] === true;
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
    viewAppearance: true,
    manageGymBranches: false,
    manageFineRule: true,
    manageSystemFeatures: false,
    managePlans: true,
    manageStatuses: true,
    managePaymentMethods: true,
    manageExpenseCategories: true,
    manageHoldDurations: true,
    manageGenders: true,
    manageExerciseTypes: true,
    manageSettingsBackup: false,
    viewBackendDiskUsage: true,
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
  website: {
    viewWebsite: false,
  },
  paymentQr: {
    viewPaymentQr: true,
    managePaymentSettings: false,
  },
  mobile: { ...DEFAULT_MOBILE_ACCESS },
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
      viewAppearance: a.settings?.viewAppearance !== false,
      manageGymBranches: a.settings?.manageGymBranches === true,
      manageFineRule: a.settings?.manageFineRule !== false,
      manageSystemFeatures: a.settings?.manageSystemFeatures === true,
      managePlans: a.settings?.managePlans !== false,
      manageStatuses: a.settings?.manageStatuses !== false,
      managePaymentMethods: a.settings?.managePaymentMethods !== false,
      manageExpenseCategories: a.settings?.manageExpenseCategories !== false,
      manageHoldDurations: a.settings?.manageHoldDurations !== false,
      manageGenders: a.settings?.manageGenders !== false,
      manageExerciseTypes: a.settings?.manageExerciseTypes !== false,
      manageSettingsBackup: a.settings?.manageSettingsBackup === true,
      viewBackendDiskUsage: a.settings?.viewBackendDiskUsage !== false,
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
    website: {
      viewWebsite: a.website?.viewWebsite === true,
    },
    paymentQr: {
      viewPaymentQr: a.paymentQr?.viewPaymentQr !== false,
      managePaymentSettings: a.paymentQr?.managePaymentSettings === true,
    },
    mobile: Object.fromEntries(
      ALL_MOBILE_PERMISSIONS.map((p) => [p.key, a.mobile?.[p.key] !== false]),
    ),
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

function isOwnerLikeRole(user: AuthUser) {
  const role = String(user.staffRole || user.role || "")
    .trim()
    .toLowerCase();
  return (
    user.id === "owner" ||
    role === "owner" ||
    role === "master_owner" ||
    role === "branch_owner"
  );
}

export function canAccessSection(user: AuthUser | null | undefined, section: string): boolean {
  if (!user) return false;
  if (user.id === "owner") return true;

  if (section === "Website") {
    if (isOwnerLikeRole(user)) return true;
    const sections = Array.isArray(user.sections) ? user.sections : [];
    if (!sections.includes("Website")) return false;
    return hasAccess(user, "website", "viewWebsite");
  }

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
  if (
    user.id === "owner" ||
    String(user.staffRole || user.role || "")
      .trim()
      .toLowerCase() === "master_owner" ||
    String(user.staffRole || user.role || "")
      .trim()
      .toLowerCase() === "owner"
  ) {
    return true;
  }
  const access = normalizeAccess(user.access);
  if (group === "paymentQr" && key === "managePaymentSettings") {
    return access.paymentQr?.managePaymentSettings === true;
  }
  if (group === "website" && key === "viewWebsite") {
    return access.website?.viewWebsite === true;
  }
  if (group === "settings" && SETTINGS_OPT_IN_KEYS.has(key)) {
    return access.settings?.[key] === true;
  }
  return (access[group] as Record<string, boolean> | undefined)?.[key] !== false;
}

/** Toggle a single mobile access key without touching web `sections`. */
export function toggleMobileAccessChild(
  form: StaffAccessFormSlice,
  key: string,
): StaffAccessFormSlice {
  const normalized = normalizeAccess(form.access);
  const mobile = { ...(normalized.mobile || {}) };
  mobile[key] = mobile[key] === false;
  return { ...form, access: { ...normalized, mobile } };
}

/** Enable or disable every mobile permission. */
export function toggleAllMobileAccess(form: StaffAccessFormSlice): StaffAccessFormSlice {
  const normalized = normalizeAccess(form.access);
  const allOn = ALL_MOBILE_PERMISSIONS.every((p) => normalized.mobile?.[p.key] !== false);
  return {
    ...form,
    access: {
      ...normalized,
      mobile: allOn ? { ...DENIED_MOBILE_ACCESS } : { ...DEFAULT_MOBILE_ACCESS },
    },
  };
}

export function isMobileAccessEnabled(access: AccessMap | null | undefined, key: string) {
  return normalizeAccess(access).mobile?.[key] !== false;
}

const MOBILE_PATH_ACCESS: Array<{ prefix: string; key: string }> = [
  { prefix: "/dashboard", key: "viewHome" },
  { prefix: "/members", key: "viewMembers" },
  { prefix: "/pt", key: "viewPt" },
  { prefix: "/staff", key: "viewStaff" },
  { prefix: "/leave", key: "viewLeave" },
  { prefix: "/more", key: "viewMore" },
  { prefix: "/finance", key: "moreFinance" },
  { prefix: "/whatsapp", key: "moreWhatsapp" },
  { prefix: "/attendance", key: "moreAttendance" },
  { prefix: "/settings", key: "moreSettings" },
  { prefix: "/logs", key: "moreLogs" },
  { prefix: "/support", key: "moreSupport" },
  { prefix: "/backend", key: "moreBackend" },
];

export function mobileAccessKeyForPath(pathname: string): string | null {
  const hit = MOBILE_PATH_ACCESS.find(
    (row) => pathname === row.prefix || pathname.startsWith(`${row.prefix}/`),
  );
  return hit?.key || null;
}

/** Whether this staff may open a route in the phone shell. */
export function canAccessMobilePath(
  user: AuthUser | null | undefined,
  pathname: string,
): boolean {
  if (!user) return false;
  if (user.id === "owner" || isMasterOwnerUser(user)) return true;
  const key = mobileAccessKeyForPath(pathname);
  if (!key) return true;
  if (key.startsWith("more") && key !== "viewMore") {
    return hasAccess(user, "mobile", "viewMore") && hasAccess(user, "mobile", key);
  }
  return hasAccess(user, "mobile", key);
}

export function firstAllowedMobileHref(user: AuthUser | null | undefined): string {
  const order = [
    { href: "/dashboard", key: "viewHome" },
    { href: "/members", key: "viewMembers" },
    { href: "/pt", key: "viewPt" },
    { href: "/staff", key: "viewStaff" },
    { href: "/leave", key: "viewLeave" },
    { href: "/more", key: "viewMore" },
  ] as const;
  for (const row of order) {
    if (hasAccess(user, "mobile", row.key)) return row.href;
  }
  return "/more";
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
    color:
      "border-amber-200 bg-amber-50 dark:border-amber-500/35 dark:bg-amber-950/45",
  },
  {
    id: "trainer",
    title: "Trainer",
    subtitle: "Members & PT focus",
    sections: ["Dashboard", "Members", "PT Clients", "Attendance"],
    color: "border-sky-200 bg-sky-50 dark:border-sky-500/35 dark:bg-sky-950/45",
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
    color:
      "border-emerald-200 bg-emerald-50 dark:border-emerald-500/35 dark:bg-emerald-950/45",
  },
];

/** Ensure stored light-only preset colors remain readable in dark mode. */
const ROLE_TEMPLATE_COLOR_FALLBACK =
  "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.04]";

const ROLE_TEMPLATE_COLOR_BY_TONE: Record<string, string> = {
  amber: "border-amber-200 bg-amber-50 dark:border-amber-500/35 dark:bg-amber-950/45",
  sky: "border-sky-200 bg-sky-50 dark:border-sky-500/35 dark:bg-sky-950/45",
  blue: "border-sky-200 bg-sky-50 dark:border-sky-500/35 dark:bg-sky-950/45",
  emerald: "border-emerald-200 bg-emerald-50 dark:border-emerald-500/35 dark:bg-emerald-950/45",
  green: "border-emerald-200 bg-emerald-50 dark:border-emerald-500/35 dark:bg-emerald-950/45",
  rose: "border-rose-200 bg-rose-50 dark:border-rose-500/35 dark:bg-rose-950/45",
  red: "border-rose-200 bg-rose-50 dark:border-rose-500/35 dark:bg-rose-950/45",
  violet: "border-violet-200 bg-violet-50 dark:border-violet-500/35 dark:bg-violet-950/45",
  purple: "border-violet-200 bg-violet-50 dark:border-violet-500/35 dark:bg-violet-950/45",
  slate: ROLE_TEMPLATE_COLOR_FALLBACK,
};

export function roleTemplateColorClasses(color?: string | null): string {
  const raw = String(color || "").trim();
  if (!raw) return ROLE_TEMPLATE_COLOR_FALLBACK;
  if (/\bdark:/.test(raw)) return raw;

  for (const [tone, classes] of Object.entries(ROLE_TEMPLATE_COLOR_BY_TONE)) {
    if (raw.includes(tone)) return classes;
  }
  return ROLE_TEMPLATE_COLOR_FALLBACK;
}
