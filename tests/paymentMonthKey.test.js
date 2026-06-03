import { describe, it, expect } from 'vitest';
import { paymentMonthKeyFromValue, billingDateFromPaymentMonth } from '../src/features/finance/paymentMonthKey.js';

describe('paymentMonthKeyFromValue', () => {
  it('uses local calendar month from date-only paidAt', () => {
    expect(paymentMonthKeyFromValue('2026-05-15')).toBe('2026-05');
  });

  it('uses date portion of ISO timestamp', () => {
    expect(paymentMonthKeyFromValue('2026-05-15T18:30:00.000Z')).toBe('2026-05');
  });
});

describe('billingDateFromPaymentMonth', () => {
  it('returns first of month', () => {
    expect(billingDateFromPaymentMonth('2026-05')).toBe('2026-05-01');
  });
});
