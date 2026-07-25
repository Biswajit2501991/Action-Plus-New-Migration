import { describe, it, expect } from 'vitest';
import {
  isPaymentQrInReminderEnabled,
  resolveMemberBranchCodeForPaymentQr,
  buildPublicPaymentQrViewUrl,
  maybeAppendPaymentQrToReminderMessage,
} from '../src/features/paymentQr/paymentQrReminder.js';

describe('paymentQrReminder', () => {
  it('isPaymentQrInReminderEnabled defaults off', () => {
    expect(isPaymentQrInReminderEnabled({})).toBe(false);
    expect(isPaymentQrInReminderEnabled({ paymentQrInReminderEnabled: false })).toBe(false);
    expect(isPaymentQrInReminderEnabled({ paymentQrInReminderEnabled: true })).toBe(true);
  });

  it('resolveMemberBranchCodeForPaymentQr uses member branch', () => {
    const gymCodes = [
      { id: 'b-apk', code: 'APK', name: 'Kolkata' },
      { id: 'b-apa', code: 'APA', name: 'Adra' },
    ];
    expect(
      resolveMemberBranchCodeForPaymentQr({ assignedGymCodeId: 'b-apa' }, gymCodes),
    ).toBe('APA');
  });

  it('resolveMemberBranchCodeForPaymentQr falls back to HQ', () => {
    const gymCodes = [{ id: 'hq', code: 'HQ', name: 'Headquarters' }];
    expect(resolveMemberBranchCodeForPaymentQr({}, gymCodes, 'hq')).toBe('HQ');
  });

  it('maybeAppendPaymentQrToReminderMessage only affects reminder when enabled', () => {
    const member = { assignedGymCodeId: 'b-apa' };
    const gymCodes = [{ id: 'b-apa', code: 'APA', name: 'Adra' }];
    const base = 'Hello Customer';
    expect(
      maybeAppendPaymentQrToReminderMessage(base, {
        templateKey: 'welcome',
        member,
        settings: { paymentQrInReminderEnabled: true },
        gymCodes,
        apiBaseUrl: '/api',
      }),
    ).toBe(base);
    const out = maybeAppendPaymentQrToReminderMessage(base, {
      templateKey: 'reminder',
      member,
      settings: { paymentQrInReminderEnabled: true },
      gymCodes,
      apiBaseUrl: '/api',
    });
    expect(out).toMatch(/Click below to pay:/);
    expect(out.includes(buildPublicPaymentQrViewUrl('APA', '/api'))).toBe(true);
  });

  it('maybeAppendPaymentQrToReminderMessage leaves message unchanged when disabled', () => {
    const member = { assignedGymCodeId: 'b-apa' };
    const gymCodes = [{ id: 'b-apa', code: 'APA', name: 'Adra' }];
    const base = 'Reminder body';
    expect(
      maybeAppendPaymentQrToReminderMessage(base, {
        templateKey: 'reminder',
        member,
        settings: {},
        gymCodes,
        apiBaseUrl: '/api',
      }),
    ).toBe(base);
  });
});
