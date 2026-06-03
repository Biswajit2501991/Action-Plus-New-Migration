import { describe, it, expect } from 'vitest';
import { paymentRowToApp } from '../backend/src/db/supabase/mappers.js';

describe('paymentRowToApp paid_month round-trip', () => {
  it('maps paid_month from DB row to app paidMonth', () => {
    const app = paymentRowToApp({
      id: 1,
      external_payment_id: 'pay-1',
      paid_at: '2026-07-02T10:00:00.000Z',
      amount: 900,
      method: 'UPI',
      paid_month: '2026-05',
      billing_month: '2026-07',
      billing_date: '2026-05-30',
      recorded_by: 'Staff',
      source: 'manual',
      note: '',
      created_at: '2026-07-02T10:00:00.000Z',
    });
    expect(app.paidMonth).toBe('2026-05');
    expect(app.paidAt).toBe('2026-07-02T10:00:00.000Z');
    expect(app.billingDate).toBe('2026-05-30');
  });

  it('falls back billingMonth when paid_month absent', () => {
    const app = paymentRowToApp({
      id: 2,
      paid_at: '2026-05-04',
      amount: 100,
      billing_month: '2026-05',
      billing_date: '2026-05-01',
    });
    expect(app.paidMonth).toBe('2026-05');
  });
});
