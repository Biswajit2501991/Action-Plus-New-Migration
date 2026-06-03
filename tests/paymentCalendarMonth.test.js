import { describe, it, expect } from 'vitest';
import {
  paymentCalendarDayKey,
  paymentInCalendarMonth,
  calendarMonthPaidAtBounds,
} from '../src/features/finance/paymentCalendarMonth.js';

describe('paymentCalendarMonth', () => {
  it('maps ISO paid_at to UTC calendar day', () => {
    expect(paymentCalendarDayKey('2026-05-15T10:00:00.000Z')).toBe('2026-05-15');
  });

  it('assigns payment to May not June', () => {
    expect(paymentInCalendarMonth('2026-05-31T18:30:00.000Z', '2026-05')).toBe(true);
    expect(paymentInCalendarMonth('2026-06-01T00:00:00.000Z', '2026-05')).toBe(false);
  });

  it('bounds exclude next month', () => {
    const b = calendarMonthPaidAtBounds('2026-05');
    expect(b.from).toBe('2026-05-01T00:00:00.000Z');
    expect(b.toExclusive).toBe('2026-06-01T00:00:00.000Z');
  });
});
