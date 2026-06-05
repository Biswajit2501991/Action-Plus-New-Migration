import { test, expect } from '../fixtures/auth.fixture';
import { apiHealthOk, apiJson, rawApi } from '../utils/api-client';

/**
 * Payment edit must hit PATCH /api/members/:id/payments/:paymentId and only
 * persist when the DB row is updated. Simulates API failure → row stays.
 */
test.describe('@critical Payment edit persistence', () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async () => {
    const ok = await apiHealthOk();
    test.skip(!ok && process.env.E2E_REQUIRE_BACKEND !== '0', 'Backend+Supabase required');
  });

  test('API failure: PATCH 404 does not claim success', async ({ ownerToken }) => {
    const res = await rawApi(
      '/api/members/e2e-nonexistent-member/payments/e2e-fake-payment-id',
      ownerToken,
      {
        method: 'PATCH',
        body: JSON.stringify({
          amount: 1000,
          paidAt: '2025-06-01',
          paidMonth: '2025-06',
          method: 'Cash',
          note: '',
        }),
      },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.updated).toBe(false);
  });

  test('owner: edit payment via API persists on GET /members', async ({ ownerToken }) => {
    const members = await apiJson<Array<{
      memberId: string;
      paymentHistory?: Array<{
        id: string;
        paidAt?: string;
        amount?: number;
        paidMonth?: string;
        billingMonth?: string;
      }>;
    }>>('/api/members', ownerToken);

    const withPayments = (members || []).find(
      (m) => Array.isArray(m.paymentHistory) && m.paymentHistory.length > 0 && m.paymentHistory[0]?.id,
    );
    test.skip(!withPayments, 'No member with payment history in gym — seed one manually');

    const memberId = withPayments!.memberId;
    const original = withPayments!.paymentHistory![0];
    const paymentId = String(original.id);
    const originalAmount = Number(original.amount || 1000);
    const newAmount = originalAmount + 1;
    const newPaidAt = '2025-06-04';
    const newPaidMonth = '2025-06';

    const patch = await apiJson<{
      ok: boolean;
      updated: boolean;
      payment: { amount?: number; paidAt?: string; paidMonth?: string };
      member: { paymentHistory?: Array<{ id?: string; amount?: number; paidAt?: string; paidMonth?: string }> };
    }>(
      `/api/members/${encodeURIComponent(memberId)}/payments/${encodeURIComponent(paymentId)}`,
      ownerToken,
      {
        method: 'PATCH',
        body: JSON.stringify({
          amount: newAmount,
          paidAt: newPaidAt,
          paidMonth: newPaidMonth,
          method: 'UPI',
          note: 'e2e edit',
        }),
      },
    );
    expect(patch.ok).toBe(true);
    expect(patch.updated).toBe(true);
    expect(Number(patch.payment?.amount)).toBe(newAmount);
    expect(String(patch.payment?.paidMonth || '')).toContain('2025-06');

    const edited = (patch.member.paymentHistory || []).find((p) => String(p?.id || '') === paymentId);
    expect(edited).toBeTruthy();
    expect(Number(edited?.amount)).toBe(newAmount);

    const refetched = await apiJson<typeof withPayments>('/api/members', ownerToken);
    const again = (refetched || []).find((m) => m.memberId === memberId);
    const row = (again?.paymentHistory || []).find((p) => String(p.id || '') === paymentId);
    expect(row).toBeTruthy();
    expect(Number(row?.amount)).toBe(newAmount);
    expect(String(row?.paidMonth || row?.billingMonth || '')).toContain('2025-06');

    // Restore original values so repeated runs stay idempotent.
    await apiJson(
      `/api/members/${encodeURIComponent(memberId)}/payments/${encodeURIComponent(paymentId)}`,
      ownerToken,
      {
        method: 'PATCH',
        body: JSON.stringify({
          amount: originalAmount,
          paidAt: String(original.paidAt || '2025-01-01').slice(0, 10),
          paidMonth: String(original.paidMonth || original.billingMonth || '2025-01').slice(0, 7),
          method: 'Cash',
          note: '',
        }),
      },
    );
  });
});
