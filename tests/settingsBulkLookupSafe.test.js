import { describe, expect, it } from 'vitest';
import { SETTINGS_LOOKUP_KEYS, stripSettingsLookupKeys } from '../backend/src/db/supabase/settingsLookupLogic.js';

describe('settings bulk lookup safety', () => {
  it('stripSettingsLookupKeys removes all lookup arrays from bulk payload', () => {
    const payload = {
      plans: ['Branch A Only'],
      statuses: ['Active'],
      paymentMethods: ['Cash'],
      holdDurations: ['1 Month'],
      genders: ['Male'],
      expenseCategories: ['Rent'],
      exerciseTypes: ['Cardio'],
      fineSmsEnabled: true,
      fineSmsGraceDays: 3,
    };
    const out = stripSettingsLookupKeys(payload);
    for (const key of SETTINGS_LOOKUP_KEYS) {
      expect(out[key]).toBeUndefined();
    }
    expect(out.fineSmsEnabled).toBe(true);
    expect(out.fineSmsGraceDays).toBe(3);
  });
});
