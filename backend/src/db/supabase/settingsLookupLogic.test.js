import { describe, expect, it } from 'vitest';
import {
  applySettingsConfigJson,
  buildSettingsAppConfigWriteFromLive,
  findActiveLookupDuplicate,
  mergeSettingsBulkPatch,
  preserveNonEmptyLookups,
  shouldSkipLookupCategorySync,
  stripSettingsLookupKeys,
} from './settingsLookupLogic.js';

describe('stripSettingsLookupKeys', () => {
  it('removes lookup arrays from config_json blobs', () => {
    const out = stripSettingsLookupKeys({
      plans: [],
      statuses: ['Active'],
      medicalQuestionnaireTemplate: { q: 1 },
    });
    expect(out.plans).toBeUndefined();
    expect(out.statuses).toBeUndefined();
    expect(out.medicalQuestionnaireTemplate).toEqual({ q: 1 });
  });
});

describe('applySettingsConfigJson', () => {
  it('keeps lookup table data when config_json has empty plans', () => {
    const settings = {
      plans: ['Basic', 'PT-Raja'],
      statuses: ['Active'],
      paymentMethods: [],
      holdDurations: [],
      genders: [],
      expenseCategories: [],
      exerciseTypes: [],
    };
    applySettingsConfigJson(settings, {
      fine_sms_enabled: true,
      fine_sms_grace_days: 2,
      fine_sms_immediate_roles_json: ['owner'],
      finance_use_estimated_expense: true,
      config_json: {
        plans: [],
        statuses: [],
        medicalQuestionnaireTemplate: { version: 2 },
        customTemplatesEnabled: true,
      },
    });
    expect(settings.plans).toEqual(['Basic', 'PT-Raja']);
    expect(settings.statuses).toEqual(['Active']);
    expect(settings.medicalQuestionnaireTemplate).toEqual({ version: 2 });
    expect(settings.fineSmsGraceDays).toBe(2);
    expect(settings.customTemplatesEnabled).toBe(true);
  });

  it('leaves customTemplatesEnabled unset when absent from config_json', () => {
    const settings = { plans: ['Basic'] };
    applySettingsConfigJson(settings, {
      fine_sms_enabled: true,
      fine_sms_grace_days: 0,
      fine_sms_immediate_roles_json: [],
      finance_use_estimated_expense: true,
      config_json: {},
    });
    expect(settings.customTemplatesEnabled).toBeUndefined();
  });
});

describe('mergeSettingsBulkPatch', () => {
  it('preserves sibling feature flags when only one flag is patched', () => {
    const merged = mergeSettingsBulkPatch(
      {
        attendanceNotesEnabled: true,
        customTemplatesEnabled: true,
        paymentQrInReminderEnabled: true,
        medicalQuestionnaireTemplate: { version: 1 },
        fineSmsEnabled: true,
      },
      { attendanceNotesEnabled: false },
    );
    expect(merged.attendanceNotesEnabled).toBe(false);
    expect(merged.customTemplatesEnabled).toBe(true);
    expect(merged.paymentQrInReminderEnabled).toBe(true);
    expect(merged.medicalQuestionnaireTemplate).toEqual({ version: 1 });
  });
});

describe('buildSettingsAppConfigWriteFromLive', () => {
  it('preserves live qrVisitorAttendanceEnabled when patch only toggles notes', () => {
    const row = buildSettingsAppConfigWriteFromLive(
      {
        fine_sms_enabled: true,
        fine_sms_grace_days: 0,
        fine_sms_immediate_roles_json: [],
        finance_use_estimated_expense: true,
        config_json: {
          attendanceNotesEnabled: false,
          qrVisitorAttendanceEnabled: true,
          attendanceRequirePresenceQr: true,
          customTemplatesEnabled: false,
        },
      },
      { attendanceNotesEnabled: true },
    );
    expect(row.config_json.qrVisitorAttendanceEnabled).toBe(true);
    expect(row.config_json.attendanceRequirePresenceQr).toBe(true);
    expect(row.config_json.attendanceNotesEnabled).toBe(true);
  });

  it('preserves live attendanceRequirePresenceQr when patch only toggles notes', () => {
    const row = buildSettingsAppConfigWriteFromLive(
      {
        fine_sms_enabled: true,
        fine_sms_grace_days: 0,
        fine_sms_immediate_roles_json: [],
        finance_use_estimated_expense: true,
        config_json: {
          attendanceNotesEnabled: false,
          attendanceRequirePresenceQr: true,
          customTemplatesEnabled: false,
        },
      },
      { attendanceNotesEnabled: true },
    );
    expect(row.config_json.attendanceRequirePresenceQr).toBe(true);
    expect(row.config_json.attendanceNotesEnabled).toBe(true);
  });

  it('preserves live attendanceNotesEnabled when patch only toggles custom templates', () => {
    const row = buildSettingsAppConfigWriteFromLive(
      {
        fine_sms_enabled: true,
        fine_sms_grace_days: 2,
        fine_sms_immediate_roles_json: [],
        finance_use_estimated_expense: true,
        config_json: {
          attendanceNotesEnabled: true,
          customTemplatesEnabled: false,
          paymentQrInReminderEnabled: false,
          medicalQuestionnaireTemplate: { version: 1 },
        },
      },
      { customTemplatesEnabled: true },
    );
    expect(row.config_json.attendanceNotesEnabled).toBe(true);
    expect(row.config_json.customTemplatesEnabled).toBe(true);
    expect(row.config_json.medicalQuestionnaireTemplate).toEqual({ version: 1 });
    expect(row.fine_sms_grace_days).toBe(2);
  });

  it('can turn attendanceNotesEnabled on without wiping custom templates', () => {
    const row = buildSettingsAppConfigWriteFromLive(
      {
        fine_sms_enabled: true,
        fine_sms_grace_days: 0,
        fine_sms_immediate_roles_json: [],
        finance_use_estimated_expense: true,
        config_json: {
          attendanceNotesEnabled: false,
          customTemplatesEnabled: true,
        },
      },
      { attendanceNotesEnabled: true },
    );
    expect(row.config_json.attendanceNotesEnabled).toBe(true);
    expect(row.config_json.customTemplatesEnabled).toBe(true);
  });

  it('falls back to merged settings when config_json omits a sibling opt-in flag', () => {
    const row = buildSettingsAppConfigWriteFromLive(
      {
        fine_sms_enabled: true,
        fine_sms_grace_days: 0,
        fine_sms_immediate_roles_json: [],
        finance_use_estimated_expense: true,
        config_json: {
          attendanceNotesEnabled: false,
        },
      },
      { attendanceNotesEnabled: true },
      { customTemplatesEnabled: true },
    );
    expect(row.config_json.attendanceNotesEnabled).toBe(true);
    expect(row.config_json.customTemplatesEnabled).toBe(true);
  });

  it('does not invent false for missing live opt-in flags on unrelated patch', () => {
    const row = buildSettingsAppConfigWriteFromLive(
      {
        fine_sms_enabled: true,
        fine_sms_grace_days: 0,
        fine_sms_immediate_roles_json: [],
        finance_use_estimated_expense: true,
        config_json: {
          attendanceNotesEnabled: true,
        },
      },
      { fineSmsGraceDays: 5 },
    );
    expect(row.config_json.attendanceNotesEnabled).toBe(true);
    expect(row.config_json.customTemplatesEnabled).toBe(false);
    expect(row.fine_sms_grace_days).toBe(5);
  });
});

describe('preserveNonEmptyLookups', () => {
  it('blocks empty bulk payload from wiping existing plans', () => {
    const merged = preserveNonEmptyLookups(
      { plans: [], statuses: ['Hold'] },
      { plans: ['Basic'], statuses: ['Active', 'Hold'] },
    );
    expect(merged.plans).toEqual(['Basic']);
    expect(merged.statuses).toEqual(['Hold']);
  });

  it('allows intentional non-empty updates', () => {
    const merged = preserveNonEmptyLookups(
      { plans: ['New Plan'] },
      { plans: ['Basic'] },
    );
    expect(merged.plans).toEqual(['New Plan']);
  });
});

describe('shouldSkipLookupCategorySync', () => {
  it('skips sync when payload is empty but DB has rows', () => {
    expect(shouldSkipLookupCategorySync([], [{ id: 1 }])).toBe(true);
  });

  it('allows sync when both sides empty', () => {
    expect(shouldSkipLookupCategorySync([], [])).toBe(false);
  });

  it('allows sync when payload has values', () => {
    expect(shouldSkipLookupCategorySync(['Cash'], [{ id: 1 }])).toBe(false);
  });
});

describe('findActiveLookupDuplicate', () => {
  const branchA = 'branch-a';
  const branchB = 'branch-b';

  it('allows same plan name on different branches', () => {
    const rows = [
      { id: 1, value: 'Plan B', created_by_gym_code_id: branchA, created_by_role: 'branch_owner', is_active: true },
    ];
    expect(findActiveLookupDuplicate(rows, {
      value: 'Plan B',
      createdByGymCodeId: branchB,
      createdByRole: 'branch_owner',
    })).toBeNull();
  });

  it('detects duplicate on the same branch', () => {
    const rows = [
      { id: 1, value: 'Plan B', created_by_gym_code_id: branchB, created_by_role: 'branch_owner', is_active: true },
    ];
    expect(findActiveLookupDuplicate(rows, {
      value: 'Plan B',
      createdByGymCodeId: branchB,
      createdByRole: 'branch_owner',
    })?.id).toBe(1);
  });
});
