import { describe, it, expect } from 'vitest';
import {
  applyPaymentHistoryBackfillToMember,
  inferLegacyPaymentRowsForBackfill,
} from '../src/features/members/paymentHistoryLegacyBackfill.js';

describe('paymentHistoryLegacyBackfill', () => {
  it('infers row from paymentReceivedAt when history empty', () => {
    const rows = inferLegacyPaymentRowsForBackfill({
      memberId: 'M1',
      amount: 1000,
      paymentReceivedAt: '2026-05-12',
      paymentMethod: 'Cash',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].paidAt).toBe('2026-05-12');
    expect(rows[0].billingMonth).toBe('2026-05');
    expect(rows[0].source).toBe('legacy-backfill');
  });

  it('does not backfill when history exists', () => {
    const rows = inferLegacyPaymentRowsForBackfill({
      memberId: 'M2',
      amount: 1000,
      paymentReceivedAt: '2026-05-12',
      paymentHistory: [{ id: 'x', paidAt: '2026-04-01', amount: 500 }],
    });
    expect(rows).toHaveLength(0);
  });

  it('falls back to billingDate when no paymentReceivedAt', () => {
    const rows = inferLegacyPaymentRowsForBackfill({
      memberId: 'M3',
      amount: 800,
      billingDate: '2026-03-15',
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].paidAt).toBe('2026-03-15');
  });

  it('applyPaymentHistoryBackfillToMember merges rows', () => {
    const { member, changed, added } = applyPaymentHistoryBackfillToMember({
      memberId: 'M4',
      amount: 500,
      paymentReceivedAt: '2026-01-10',
      paymentHistory: [],
    });
    expect(changed).toBe(true);
    expect(added).toBe(1);
    expect(member.paymentHistory).toHaveLength(1);
  });
});
