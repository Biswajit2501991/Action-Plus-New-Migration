import { describe, expect, it } from 'vitest';
import {
  applySettingsConfigJson,
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
      },
    });
    expect(settings.plans).toEqual(['Basic', 'PT-Raja']);
    expect(settings.statuses).toEqual(['Active']);
    expect(settings.medicalQuestionnaireTemplate).toEqual({ version: 2 });
    expect(settings.fineSmsGraceDays).toBe(2);
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
