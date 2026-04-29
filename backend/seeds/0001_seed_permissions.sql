-- Phase 1: permission seed
insert into permissions (code, description) values
('dashboard.viewRevenueMonthly', 'View total monthly revenue tile'),
('dashboard.viewRevenueTrend', 'View dashboard revenue trend widget'),
('finance.viewRevenueAutoMembers', 'View finance revenue from members'),
('finance.viewRevenueTrend4Months', 'View finance revenue trend 4 months'),
('finance.viewPlanPopularity', 'View finance plan popularity widget'),
('finance.viewTransactionsAutoMembers', 'View transactions table'),
('settings.managePlans', 'Manage plans list'),
('settings.manageStatuses', 'Manage statuses list'),
('settings.managePaymentMethods', 'Manage payment methods list'),
('settings.manageHoldDurations', 'Manage hold durations list'),
('settings.manageGenders', 'Manage genders list'),
('members.view', 'View members'),
('members.edit', 'Edit members'),
('members.delete', 'Delete members'),
('leave.approve', 'Approve/reject leave requests'),
('staff.manage', 'Manage staff and roles')
on conflict (code) do nothing;
