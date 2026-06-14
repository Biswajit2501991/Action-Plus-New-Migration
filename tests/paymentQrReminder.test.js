import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPaymentQrInReminderEnabled,
  resolveMemberBranchCodeForPaymentQr,
  buildPublicPaymentQrViewUrl,
  maybeAppendPaymentQrToReminderMessage,
} from '../src/features/paymentQr/paymentQrReminder.js';

test('isPaymentQrInReminderEnabled defaults off', () => {
  assert.equal(isPaymentQrInReminderEnabled({}), false);
  assert.equal(isPaymentQrInReminderEnabled({ paymentQrInReminderEnabled: false }), false);
  assert.equal(isPaymentQrInReminderEnabled({ paymentQrInReminderEnabled: true }), true);
});

test('resolveMemberBranchCodeForPaymentQr uses member branch', () => {
  const gymCodes = [
    { id: 'b-apk', code: 'APK', name: 'Kolkata' },
    { id: 'b-apa', code: 'APA', name: 'Adra' },
  ];
  assert.equal(
    resolveMemberBranchCodeForPaymentQr({ assignedGymCodeId: 'b-apa' }, gymCodes),
    'APA',
  );
});

test('resolveMemberBranchCodeForPaymentQr falls back to HQ', () => {
  const gymCodes = [{ id: 'hq', code: 'HQ', name: 'Headquarters' }];
  assert.equal(resolveMemberBranchCodeForPaymentQr({}, gymCodes, 'hq'), 'HQ');
});

test('maybeAppendPaymentQrToReminderMessage only affects reminder when enabled', () => {
  const member = { assignedGymCodeId: 'b-apa' };
  const gymCodes = [{ id: 'b-apa', code: 'APA', name: 'Adra' }];
  const base = 'Hello Customer';
  assert.equal(
    maybeAppendPaymentQrToReminderMessage(base, {
      templateKey: 'welcome',
      member,
      settings: { paymentQrInReminderEnabled: true },
      gymCodes,
      apiBaseUrl: '/api',
    }),
    base,
  );
  const out = maybeAppendPaymentQrToReminderMessage(base, {
    templateKey: 'reminder',
    member,
    settings: { paymentQrInReminderEnabled: true },
    gymCodes,
    apiBaseUrl: '/api',
  });
  assert.match(out, /Click below to pay:/);
  assert.equal(out.includes(buildPublicPaymentQrViewUrl('APA', '/api')), true);
});

test('maybeAppendPaymentQrToReminderMessage leaves message unchanged when disabled', () => {
  const member = { assignedGymCodeId: 'b-apa' };
  const gymCodes = [{ id: 'b-apa', code: 'APA', name: 'Adra' }];
  const base = 'Reminder body';
  assert.equal(
    maybeAppendPaymentQrToReminderMessage(base, {
      templateKey: 'reminder',
      member,
      settings: {},
      gymCodes,
      apiBaseUrl: '/api',
    }),
    base,
  );
});
