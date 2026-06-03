import { describe, it, expect } from 'vitest';
import {
  derivePaidMonthFromBilling,
  formatPaidMonthDisplay,
  payMonthKeyFromStoredValue,
  paymentInPaidMonth,
  resolvePaidMonthForPayment,
  validatePaidMonthKey,
} from '../src/features/finance/derivePaidMonth.js';

describe('derivePaidMonthFromBilling', () => {
  it('returns YYYY-MM from billing date before payment', () => {
    expect(derivePaidMonthFromBilling('2026-05-30')).toBe('2026-05');
    expect(derivePaidMonthFromBilling('2026-05-30T00:00:00.000Z')).toBe('2026-05');
  });

  it('returns empty for invalid billing date', () => {
    expect(derivePaidMonthFromBilling('')).toBe('');
    expect(derivePaidMonthFromBilling(null)).toBe('');
  });
});

describe('validatePaidMonthKey', () => {
  it('accepts valid months and rejects invalid', () => {
    expect(validatePaidMonthKey('2026-05')).toBe('2026-05');
    expect(validatePaidMonthKey('2026-13')).toBe('');
    expect(validatePaidMonthKey('bad')).toBe('');
  });
});

describe('resolvePaidMonthForPayment', () => {
  it('prefers manual paidMonth override', () => {
    expect(resolvePaidMonthForPayment({
      paidMonth: '2026-04',
      billingDateBefore: '2026-05-30',
      paidAt: '2026-07-02',
    })).toBe('2026-04');
  });

  it('derives from billing date when no override (late pay example)', () => {
    expect(resolvePaidMonthForPayment({
      billingDateBefore: '2026-05-30',
      paidAt: '2026-07-02',
    })).toBe('2026-05');
  });

  it('falls back to paidAt month for legacy rows', () => {
    expect(resolvePaidMonthForPayment({ paidAt: '2026-07-02' })).toBe('2026-07');
  });
});

describe('paymentInPaidMonth', () => {
  it('matches service month only', () => {
    expect(paymentInPaidMonth('2026-05', '2026-05')).toBe(true);
    expect(paymentInPaidMonth('2026-05', '2026-07')).toBe(false);
  });
});

describe('payMonthKeyFromStoredValue', () => {
  it('parses YYYY-MM and legacy May-2026 labels', () => {
    expect(payMonthKeyFromStoredValue('2026-05')).toBe('2026-05');
    expect(payMonthKeyFromStoredValue('May-2026')).toBe('2026-05');
  });

  it('formats display label', () => {
    expect(formatPaidMonthDisplay('2026-05')).toBe('May 2026');
  });
});
