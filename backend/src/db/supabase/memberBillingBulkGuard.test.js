import { describe, expect, it } from 'vitest';
import { preserveNewerBillingOnBulkRow } from './memberBillingBulkGuard.js';

describe('preserveNewerBillingOnBulkRow', () => {
  it('keeps DB billing fields when bulk payload is older', () => {
    const incoming = {
      member_code: 'APG-1',
      billing_date: '2026-05-12',
      billing_date_updated_at: '2026-05-12T10:00:00.000Z',
      next_payment_date: '2026-06-12',
      payment_by: '2026-05-19',
    };
    const existing = {
      member_code: 'APG-1',
      billing_date: '2026-06-12',
      billing_date_updated_at: '2026-06-12T13:00:00.000Z',
      next_payment_date: '2026-07-12',
      payment_by: '2026-06-19',
    };
    const out = preserveNewerBillingOnBulkRow(incoming, existing);
    expect(out.billing_date).toBe('2026-06-12');
    expect(out.billing_date_updated_at).toBe('2026-06-12T13:00:00.000Z');
    expect(out.next_payment_date).toBe('2026-07-12');
    expect(out.payment_by).toBe('2026-06-19');
  });

  it('allows newer bulk billing fields through', () => {
    const incoming = {
      billing_date: '2026-06-12',
      billing_date_updated_at: '2026-06-12T13:00:00.000Z',
    };
    const existing = {
      billing_date: '2026-05-12',
      billing_date_updated_at: '2026-05-12T10:00:00.000Z',
    };
    const out = preserveNewerBillingOnBulkRow(incoming, existing);
    expect(out.billing_date).toBe('2026-06-12');
  });
});
