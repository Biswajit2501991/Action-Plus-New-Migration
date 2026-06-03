import { describe, it, expect, afterEach } from 'vitest';
import {
  paymentHistoryListMonthsBack,
  paymentHistoryListSinceIso,
} from '../backend/src/db/supabase/memberPaymentsListWindow.js';

describe('paymentHistoryListMonthsBack', () => {
  const prev = process.env.APG_PAYMENT_HISTORY_LIST_MONTHS_BACK;

  afterEach(() => {
    if (prev === undefined) delete process.env.APG_PAYMENT_HISTORY_LIST_MONTHS_BACK;
    else process.env.APG_PAYMENT_HISTORY_LIST_MONTHS_BACK = prev;
  });

  it('defaults to 84 months (7 years)', () => {
    delete process.env.APG_PAYMENT_HISTORY_LIST_MONTHS_BACK;
    expect(paymentHistoryListMonthsBack()).toBe(84);
  });

  it('respects env override', () => {
    process.env.APG_PAYMENT_HISTORY_LIST_MONTHS_BACK = '120';
    expect(paymentHistoryListMonthsBack()).toBe(120);
  });

  it('sinceIso reaches before May 2024 when now is mid 2026', () => {
    delete process.env.APG_PAYMENT_HISTORY_LIST_MONTHS_BACK;
    const since = paymentHistoryListSinceIso(new Date('2026-06-01T12:00:00.000Z'));
    expect(since.slice(0, 10) <= '2024-05-01').toBe(true);
  });
});
