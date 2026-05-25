import { describe, expect, it } from 'vitest';
import { reminderSentForCurrentBilling } from '../src/features/members/reminderBillingCycle.js';

describe('reminderSentForCurrentBilling', () => {
  it('returns false when no reminder was sent', () => {
    expect(reminderSentForCurrentBilling({ billingDate: '2026-05-25' })).toBe(false);
  });

  it('blocks staff cycle when reminder sent on current billing date', () => {
    expect(
      reminderSentForCurrentBilling({
        billingDate: '2026-05-22',
        reminderSentAt: '2026-05-22T10:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('allows staff again when billing date moved after owner reminder', () => {
    expect(
      reminderSentForCurrentBilling({
        billingDate: '2026-06-25',
        reminderSentAt: '2026-05-22T10:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('blocks again after staff sends for new billing date', () => {
    expect(
      reminderSentForCurrentBilling({
        billingDate: '2026-06-25',
        reminderSentAt: '2026-06-25T14:00:00.000Z',
      }),
    ).toBe(true);
  });
});
