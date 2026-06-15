/**
 * Staff access checks — keep in sync with src/features/access/permissions.js
 */
import { getStaffAppUser } from './staffAuth.js';

const ACCESS_CACHE_MS = 60_000;
const accessCache = new Map();

/** @typedef {Record<string, Record<string, boolean>>} NormalizedAccess */

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
  };
}

/** @param {NormalizedAccess | { __owner?: boolean }} access */
export function isAccessAllowed(access, checkFn) {
  if (!access) return false;
  if (access.__owner) return true;
  return Boolean(checkFn(access));
}

export const Access = {
  membersRead: (a) => a.members.viewMembers,
  membersWrite: (a) => a.members.editMembers || a.members.addMembers || a.members.deleteMembers,
  visitorsRead: (a) => a.members.viewVisitors,
  visitorsWrite: (a) => a.members.editMembers || a.members.addMembers,
  visitorsDelete: (a) => a.members.deleteMembers || a.members.editMembers,
  financeRead: (a) => {
    const f = a.finance;
    return (
      f.viewRevenueAutoMembers
      || f.viewRevenueTrend4Months
      || f.viewPlanPopularity
      || f.viewTransactionsAutoMembers
      || f.viewPendingPayments
      || f.viewExpenseCard
      || f.viewProfitCard
      || f.manageExpenses
    );
  },
  financeWrite: (a) => a.finance.manageExpenses,
  logsRead: (a) => a.logs.viewLogs,
  /** Append-only audit entries (POST /api/logs) — any authenticated staff. */
  logsAppend: () => true,
  /** Bulk log sync from client — requires View Audit Logs (legacy path). */
  logsWrite: (a) => a.logs.viewLogs,
  logsClear: (a) => a.logs.clearLogs,
  smsRead: (a) => Object.values(a.whatsapp).some(Boolean),
  smsWrite: (a) => Object.values(a.whatsapp).some(Boolean),
  /** Branch-scoped WhatsApp template bodies (read). */
  templatesRead: (a) => a.__owner || a.whatsapp?.viewTemplates !== false,
  /** Branch-scoped WhatsApp template bodies (PATCH). Staff: own branch when viewTemplates. */
  templatesWrite: (a) => a.__owner || a.whatsapp?.viewTemplates !== false,
  /** Shared config (plans, lookups, attendance) — any logged-in staff. */
  settingsRead: () => true,
  /** Record own login/logout punch (any authenticated staff). */
  attendancePunch: () => true,
  /** Upsert attendance rows from Attendance page. */
  attendanceWrite: (a) => a.attendance.editAttendance !== false || a.attendance.markAllPresent !== false,
  ptClientsRead: (a) => a.ptClients.viewPtClients !== false,
  ptClientsWriteWorkout: (a) => a.ptClients.editPtWorkout !== false,
  ptClientsWritePlan: (a) => a.ptClients.editPtPlan !== false,
  paymentQrView: (a) => a.__owner || a.paymentQr?.viewPaymentQr !== false,
  paymentQrManage: (a) => a.__owner || a.paymentQr?.managePaymentSettings === true,
  leaveBalanceView: (a) => a.__owner || a.leave?.viewAnnualLeaveBalance !== false,
  leaveBalanceManage: (a) => a.__owner,
};

export function invalidateStaffAccessCache(staffLoginId) {
  const key = String(staffLoginId || '').trim().toLowerCase();
  if (key) accessCache.delete(key);
}

export function clearStaffAccessCache() {
  accessCache.clear();
}

/**
 * @returns {Promise<NormalizedAccess | { __owner: true } | null>}
 */
export async function getStaffAccessForUser(staffLoginId) {
  const key = String(staffLoginId || '').trim().toLowerCase();
  if (!key) return null;
  if (key === 'owner') return { __owner: true };
  // branch_owner uses granular access_json — never __owner wildcard

  const hit = accessCache.get(key);
  if (hit && Date.now() - hit.at < ACCESS_CACHE_MS) return hit.access;

  const user = await getStaffAppUser(staffLoginId);
  if (!user || user.blocked) return null;

  const access = normalizeAccess(user.access || {});
  accessCache.set(key, { access, at: Date.now() });
  return access;
}
