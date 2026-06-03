import { describe, it, expect } from 'vitest';
import {
  buildPaymentIncomeLedgerRows,
  buildBillingPendingLedgerRows,
} from '../src/features/finance/financeLedger.js';

const calendar = (v) => String(v || '').slice(0, 10);

describe('buildPaymentIncomeLedgerRows', () => {
  it('creates one paid ledger row per payment with transaction date', () => {
    const rows = buildPaymentIncomeLedgerRows(
      [{
        memberId: 'M1',
        name: 'Test',
        plan: 'Basic',
        status: 'Active',
        paymentHistory: [
          { id: 'p1', paidAt: '2026-05-10', amount: 1500, method: 'UPI' },
        ],
      }],
      (m) => m.paymentHistory,
      calendar,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe('2026-05-10');
    expect(rows[0].status).toBe('paid');
    expect(rows[0].amount).toBe(1500);
  });
});

describe('buildBillingPendingLedgerRows', () => {
  it('marks overdue active members as pending', () => {
    const rows = buildBillingPendingLedgerRows(
      [{
        memberId: 'M2',
        name: 'Late',
        status: 'Active',
        billingDate: '2026-04-01',
        amount: 2000,
        plan: 'Gold',
      }],
      {
        retentionPaymentDeadline: () => new Date('2026-04-15'),
        calendarDateKey: calendar,
        today: new Date('2026-06-01'),
      },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
  });
});
