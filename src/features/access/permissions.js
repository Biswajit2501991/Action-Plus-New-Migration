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
  { key: 'viewRevenueMonthly', label: 'Total Revenue (Monthly)' },
  { key: 'viewRevenueTrend', label: 'Revenue and Membership Trends' },
];

export const FINANCE_CHILD_PERMISSIONS = [
  { key: 'viewRevenueAutoMembers', label: 'Finance - Revenue (Auto from Members)' },
  { key: 'viewRevenueTrend4Months', label: 'Revenue Trend (Last 4 Months)' },
  { key: 'viewPlanPopularity', label: 'Plan Popularity' },
  { key: 'viewTransactionsAutoMembers', label: 'Transactions (Auto from Members)' },
];

export const DEFAULT_ACCESS = {
  dashboard: {
    viewRevenueMonthly: true,
    viewRevenueTrend: true,
  },
  finance: {
    viewRevenueAutoMembers: true,
    viewRevenueTrend4Months: true,
    viewPlanPopularity: true,
    viewTransactionsAutoMembers: true,
  },
};

export function normalizeAccess(access) {
  return {
    dashboard: {
      viewRevenueMonthly: access?.dashboard?.viewRevenueMonthly !== false,
      viewRevenueTrend: access?.dashboard?.viewRevenueTrend !== false,
    },
    finance: {
      viewRevenueAutoMembers: access?.finance?.viewRevenueAutoMembers !== false,
      viewRevenueTrend4Months: access?.finance?.viewRevenueTrend4Months !== false,
      viewPlanPopularity: access?.finance?.viewPlanPopularity !== false,
      viewTransactionsAutoMembers: access?.finance?.viewTransactionsAutoMembers !== false,
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
