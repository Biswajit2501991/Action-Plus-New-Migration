export const ALL_SECTIONS = [
  'Dashboard',
  'Members',
  'PT Clients',
  'WhatsApp SMS',
  'Finance',
  'Staff',
  'Attendance',
  'Leave Tracker',
  'Settings',
  'Logs',
  'Support',
  'Backend',
];

export const DASHBOARD_CHILD_PERMISSIONS = [
  { key: 'viewDashboardCore', label: 'Active / Hold / Deactivated / Cancelled + Filter + Add New Member' },
  { key: 'viewOverdueRetentionAlerts', label: 'Overdue Payments and Retention Alerts' },
  { key: 'viewRevenueMonthly', label: 'Total Revenue (Monthly)' },
  { key: 'viewRevenueTrend', label: 'Revenue' },
  { key: 'viewMembershipTrends', label: 'Membership Trends' },
];

export const FINANCE_CHILD_PERMISSIONS = [
  { key: 'viewRevenueAutoMembers', label: 'Finance - Revenue (Auto from Members)' },
  { key: 'viewRevenueTrend4Months', label: 'Revenue Trend (Last 4 Months)' },
  { key: 'viewPlanPopularity', label: 'Plan Popularity' },
  { key: 'viewTransactionsAutoMembers', label: 'Transactions (Auto from Members)' },
  { key: 'viewYtdCollected', label: 'YTD Collected' },
  { key: 'manageExpenses', label: 'Add / Edit Expense Entries' },
];

export const SETTINGS_CHILD_PERMISSIONS = [
  { key: 'managePlans', label: 'Plans' },
  { key: 'manageStatuses', label: 'Statuses' },
  { key: 'managePaymentMethods', label: 'Payment Methods' },
  { key: 'manageExpenseCategories', label: 'Expense Categories' },
  { key: 'manageHoldDurations', label: 'Hold Durations' },
  { key: 'manageGenders', label: 'Genders' },
  { key: 'viewBackendDiskUsage', label: 'Disk Usage (Backend)' },
  { key: 'manageFineRule', label: 'Fine SMS Rule' },
];

export const WHATSAPP_CHILD_PERMISSIONS = [
  { key: 'viewReminder', label: 'Reminder' },
  { key: 'viewMonthReminder', label: 'Month-Based Reminder' },
  { key: 'viewSuccess', label: 'Success SMS' },
  { key: 'viewFine', label: 'Fine SMS' },
  { key: 'viewDeactivate', label: 'Deactivate SMS' },
  { key: 'viewHold', label: 'Hold SMS' },
  { key: 'viewWelcome', label: 'Welcome SMS' },
  { key: 'viewTemplates', label: 'WhatsApp Template' },
];

export const LEAVE_CHILD_PERMISSIONS = [
  { key: 'viewCreateLeaveRequest', label: 'Create Leave Request' },
  { key: 'viewLeaveRequests', label: 'Leave Requests (with approve/reject if eligible)' },
  { key: 'viewAnnualLeaveBalance', label: 'Annual Leave Balance' },
  { key: 'viewLeaveHistory', label: 'Leave History (Last 2 Years)' },
];

export const MEMBERS_CHILD_PERMISSIONS = [
  { key: 'viewMembers', label: 'View Members' },
  { key: 'viewVisitors', label: 'View Visitors' },
  { key: 'addMembers', label: 'Add Members' },
  { key: 'editMembers', label: 'Edit Members' },
  { key: 'deleteMembers', label: 'Delete Members' },
];

export const PT_CLIENTS_CHILD_PERMISSIONS = [
  { key: 'viewPtClients', label: 'View PT Clients' },
  { key: 'editPtPlan', label: 'Edit PT Plan' },
  { key: 'editPtWorkout', label: 'Edit PT Workout' },
  { key: 'uploadDietDocuments', label: 'Upload Diet Documents' },
];

export const ATTENDANCE_CHILD_PERMISSIONS = [
  { key: 'viewAttendance', label: 'View Attendance Dashboard' },
  { key: 'markAllPresent', label: 'Mark All Present' },
  { key: 'editAttendance', label: 'Edit Status / Notes' },
  { key: 'submitOwnLateNote', label: 'Submit own late-arrival note (no Attendance tab required)' },
];

export const LOGS_CHILD_PERMISSIONS = [
  { key: 'viewLogs', label: 'View Audit Logs' },
  { key: 'exportLogs', label: 'Export Logs CSV' },
  { key: 'clearLogs', label: 'Clear Logs' },
];

export const SUPPORT_CHILD_PERMISSIONS = [
  { key: 'viewSupportTemplates', label: 'View Support Templates' },
  { key: 'editSupportTemplates', label: 'Edit / Save Support Templates' },
];

export const BACKEND_CHILD_PERMISSIONS = [
  { key: 'viewBackendPage', label: 'View Backend Section' },
  { key: 'controlBackendProcesses', label: 'Restart / Turn On / Turn Off Backend' },
];

export const PAYMENT_QR_CHILD_PERMISSIONS = [
  { key: 'viewPaymentQr', label: 'View Payment QR (Members toolbar)' },
  { key: 'managePaymentSettings', label: 'Manage Payment Settings (Owner)' },
];

export const DEFAULT_ACCESS = {
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
  mobile: {
    viewHome: true,
    viewMembers: true,
    viewPt: true,
    viewStaff: true,
    viewLeave: true,
    viewMore: true,
    homeCoreStats: true,
    homeRevenue: true,
    homeOverdue: true,
    membersAdd: true,
    membersEdit: true,
    membersExpand: true,
    leaveCreate: true,
    leaveApprove: true,
    moreFinance: true,
    moreWhatsapp: true,
    moreAttendance: true,
    moreSettings: true,
    moreLogs: true,
    moreSupport: true,
    moreBackend: true,
  },
};

/** Attendance tab visibility — not required for late-note self submit. */
export const ATTENDANCE_SECTION_PERMISSION_KEYS = [
  'viewAttendance',
  'markAllPresent',
  'editAttendance',
];

export function canSubmitOwnLateNote(access) {
  return access?.attendance?.submitOwnLateNote !== false;
}

export function normalizeAccess(access) {
  return {
    dashboard: {
      viewDashboardCore: access?.dashboard?.viewDashboardCore !== false,
      viewOverdueRetentionAlerts: access?.dashboard?.viewOverdueRetentionAlerts !== false,
      viewRevenueMonthly: access?.dashboard?.viewRevenueMonthly !== false,
      viewRevenueTrend: access?.dashboard?.viewRevenueTrend !== false,
      viewMembershipTrends: access?.dashboard?.viewMembershipTrends !== false,
    },
    finance: {
      viewRevenueAutoMembers: access?.finance?.viewRevenueAutoMembers !== false,
      viewRevenueTrend4Months: access?.finance?.viewRevenueTrend4Months !== false,
      viewPlanPopularity: access?.finance?.viewPlanPopularity !== false,
      viewTransactionsAutoMembers: access?.finance?.viewTransactionsAutoMembers !== false,
      viewPendingPayments: access?.finance?.viewPendingPayments !== false,
      viewExpenseCard: access?.finance?.viewExpenseCard !== false,
      viewProfitCard: access?.finance?.viewProfitCard !== false,
      viewYtdCollected: access?.finance?.viewYtdCollected !== false,
      manageExpenses: access?.finance?.manageExpenses !== false,
    },
    settings: {
      managePlans: access?.settings?.managePlans !== false,
      manageStatuses: access?.settings?.manageStatuses !== false,
      managePaymentMethods: access?.settings?.managePaymentMethods !== false,
      manageExpenseCategories: access?.settings?.manageExpenseCategories !== false,
      manageHoldDurations: access?.settings?.manageHoldDurations !== false,
      manageGenders: access?.settings?.manageGenders !== false,
      viewBackendDiskUsage: access?.settings?.viewBackendDiskUsage !== false,
      manageFineRule: access?.settings?.manageFineRule !== false,
    },
    whatsapp: {
      viewReminder: access?.whatsapp?.viewReminder !== false,
      viewMonthReminder: access?.whatsapp?.viewMonthReminder !== false,
      viewSuccess: access?.whatsapp?.viewSuccess !== false,
      viewFine: access?.whatsapp?.viewFine !== false,
      viewDeactivate: access?.whatsapp?.viewDeactivate !== false,
      viewHold: access?.whatsapp?.viewHold !== false,
      viewWelcome: access?.whatsapp?.viewWelcome !== false,
      viewTemplates: access?.whatsapp?.viewTemplates !== false,
    },
    leave: {
      viewCreateLeaveRequest: access?.leave?.viewCreateLeaveRequest !== false,
      viewLeaveRequests: access?.leave?.viewLeaveRequests !== false,
      viewAnnualLeaveBalance: access?.leave?.viewAnnualLeaveBalance !== false,
      viewLeaveHistory: access?.leave?.viewLeaveHistory !== false,
    },
    members: {
      viewMembers: access?.members?.viewMembers !== false,
      viewVisitors: access?.members?.viewVisitors !== false,
      addMembers: access?.members?.addMembers !== false,
      editMembers: access?.members?.editMembers !== false,
      deleteMembers: access?.members?.deleteMembers !== false,
    },
    ptClients: {
      viewPtClients: access?.ptClients?.viewPtClients !== false,
      editPtPlan: access?.ptClients?.editPtPlan !== false,
      editPtWorkout: access?.ptClients?.editPtWorkout !== false,
      uploadDietDocuments: access?.ptClients?.uploadDietDocuments !== false,
    },
    attendance: {
      viewAttendance: access?.attendance?.viewAttendance !== false,
      markAllPresent: access?.attendance?.markAllPresent !== false,
      editAttendance: access?.attendance?.editAttendance !== false,
      submitOwnLateNote: access?.attendance?.submitOwnLateNote !== false,
    },
    logs: {
      viewLogs: access?.logs?.viewLogs !== false,
      exportLogs: access?.logs?.exportLogs !== false,
      clearLogs: access?.logs?.clearLogs !== false,
    },
    support: {
      viewSupportTemplates: access?.support?.viewSupportTemplates !== false,
      editSupportTemplates: access?.support?.editSupportTemplates !== false,
    },
    backend: {
      viewBackendPage: access?.backend?.viewBackendPage !== false,
      controlBackendProcesses: access?.backend?.controlBackendProcesses !== false,
    },
    paymentQr: {
      viewPaymentQr: access?.paymentQr?.viewPaymentQr !== false,
      managePaymentSettings: access?.paymentQr?.managePaymentSettings === true,
    },
    mobile: {
      viewHome: access?.mobile?.viewHome !== false,
      viewMembers: access?.mobile?.viewMembers !== false,
      viewPt: access?.mobile?.viewPt !== false,
      viewStaff: access?.mobile?.viewStaff !== false,
      viewLeave: access?.mobile?.viewLeave !== false,
      viewMore: access?.mobile?.viewMore !== false,
      homeCoreStats: access?.mobile?.homeCoreStats !== false,
      homeRevenue: access?.mobile?.homeRevenue !== false,
      homeOverdue: access?.mobile?.homeOverdue !== false,
      membersAdd: access?.mobile?.membersAdd !== false,
      membersEdit: access?.mobile?.membersEdit !== false,
      membersExpand: access?.mobile?.membersExpand !== false,
      leaveCreate: access?.mobile?.leaveCreate !== false,
      leaveApprove: access?.mobile?.leaveApprove !== false,
      moreFinance: access?.mobile?.moreFinance !== false,
      moreWhatsapp: access?.mobile?.moreWhatsapp !== false,
      moreAttendance: access?.mobile?.moreAttendance !== false,
      moreSettings: access?.mobile?.moreSettings !== false,
      moreLogs: access?.mobile?.moreLogs !== false,
      moreSupport: access?.mobile?.moreSupport !== false,
      moreBackend: access?.mobile?.moreBackend !== false,
    },
  };
}

export function sectionsWithRoleDefaults(user) {
  if (!user || !user.id) return user;
  const current = Array.isArray(user.sections) ? user.sections : [];
  let required = [];
  if (user.id === 'owner') required = [...ALL_SECTIONS];
  if (user.id === 'manager') required = ['Dashboard', 'Members', 'PT Clients', 'Finance', 'Staff', 'Attendance', 'Leave Tracker', 'Settings', 'Logs'];
  if (user.id === 'trainer') required = ['Dashboard', 'Members', 'PT Clients', 'Attendance'];
  if (!required.length) return { ...user, access: normalizeAccess(user.access) };
  return {
    ...user,
    sections: Array.from(new Set([...current, ...required])),
    access: normalizeAccess(user.access),
  };
}
