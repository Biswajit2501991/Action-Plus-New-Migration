/** PostgREST table names — must match Supabase Table Editor exactly. */

export const MEMBERS_TABLE_LEGACY = 'members (Phase 1 core)';

/** Resolved at startup via initMembersTableName(); defaults to canonical name. */
export let membersTableName = 'members';

export async function initMembersTableName(sb) {
  for (const candidate of ['members', MEMBERS_TABLE_LEGACY]) {
    const { error } = await sb.from(candidate).select('id').limit(1);
    if (!error) {
      membersTableName = candidate;
      return candidate;
    }
  }
  throw new Error(`Neither "members" nor "${MEMBERS_TABLE_LEGACY}" found in Supabase`);
}

export const T = {
  get members() {
    return membersTableName;
  },
  gyms: 'gyms',
  gym_codes: 'gym_codes',
  staff_users: 'staff_users',
  staff_user_sections: 'staff_user_sections',
  staff_user_access: 'staff_user_access',
  staff_role_templates: 'staff_role_templates',
  staff_branch_assignments: 'staff_branch_assignments',
  settings_lookup_values: 'settings_lookup_values',
  settings_templates: 'settings_templates',
  branch_custom_templates: 'branch_custom_templates',
  payment_qr_settings: 'payment_qr_settings',
  settings_app_config: 'settings_app_config',
  settings_staff_directory: 'settings_staff_directory',
  leave_requests: 'leave_requests',
  leave_balance_adjustments: 'leave_balance_adjustments',
  staff_attendance_records: 'staff_attendance_records',
  member_payment_history: 'member_payment_history',
  member_paid_for_month: 'member_paid_for_month',
  member_paid_for_month_amount_audit: 'member_paid_for_month_amount_audit',
  member_delete_audit: 'member_delete_audit',
  member_message_history: 'member_message_history',
  member_attachments: 'member_attachments',
  member_injury_notes: 'member_injury_notes',
  pt_client_profiles: 'pt_client_profiles',
  visitors: 'visitors',
  finance_transactions: 'finance_transactions',
  audit_logs: 'audit_logs',
  sms_status_events: 'sms_status_events',
};

export const LOOKUP_CATEGORIES = [
  ['plans', 'plans'],
  ['statuses', 'statuses'],
  ['paymentMethods', 'paymentMethods'],
  ['holdDurations', 'holdDurations'],
  ['genders', 'genders'],
  ['expenseCategories', 'expenseCategories'],
  ['exerciseTypes', 'exerciseTypes'],
];
