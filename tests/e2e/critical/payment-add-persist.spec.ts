import { test, expect } from '../fixtures/auth.fixture';
import { apiHealthOk, apiJson, rawApi } from '../utils/api-client';

/**
 * Payment add must hit POST /api/members/:id/payments and only persist when
 * the DB row is created. Simulates API failure → no success claim.
 */
test.describe('@critical Payment add persistence', () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async () => {
    const ok = await apiHealthOk();
    test.skip(!ok && process.env.E2E_REQUIRE_BACKEND !== '0', 'Backend+Supabase required');
  });

  test('API failure: POST to nonexistent member returns created false', async ({ ownerToken }) => {
    const res = await rawApi(
      '/api/members/e2e-nonexistent-member/payments',
      ownerToken,
      {
        method: 'POST',
        body: JSON.stringify({
          paymentId: 'e2e-add-fake-id',
          amount: 1000,
          paidAt: '2025-06-01',
          paidMonth: '2025-06',
          method: 'Cash',
          note: 'e2e add fail',
        }),
      },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.created).toBe(false);
  });

  test('owner: add payment via API persists on GET /members', async ({ ownerToken }) => {
    const members = await apiJson<Array<{
      memberId: string;
      paymentHistory?: Array<{ id: string }>;
    }>>('/api/members', ownerToken);

    const target = (members || []).find((m) => String(m.memberId || '').trim());
    test.skip(!target, 'No members in gym');

    const memberId = target!.memberId;
    const paymentId = `e2e-add-${Date.now()}`;
    const amount = 1234;
    const paidAt = '2025-06-06';
    const paidMonth = '2025-06';

    const created = await apiJson<{
      ok: boolean;
      created: boolean;
      paymentId: string;
      payment: { amount?: number; paidAt?: string; paidMonth?: string };
      member: { paymentHistory?: Array<{ id?: string; amount?: number }> };
    }>(
      `/api/members/${encodeURIComponent(memberId)}/payments`,
      ownerToken,
      {
        method: 'POST',
        body: JSON.stringify({
          paymentId,
          amount,
          paidAt,
          paidMonth,
          method: 'UPI',
          note: 'e2e add',
          source: 'manual',
        }),
      },
    );
    expect(created.ok).toBe(true);
    expect(created.created).toBe(true);
    expect(created.paymentId).toBe(paymentId);
    expect(Number(created.payment?.amount)).toBe(amount);

    const inMember = (created.member.paymentHistory || []).find((p) => String(p?.id || '') === paymentId);
    expect(inMember).toBeTruthy();
    expect(Number(inMember?.amount)).toBe(amount);

    const refetched = await apiJson<typeof target>('/api/members', ownerToken);
    const again = (refetched || []).find((m) => m.memberId === memberId);
    const row = (again?.paymentHistory || []).find((p) => String(p.id || '') === paymentId);
    expect(row).toBeTruthy();
    expect(Number(row?.amount)).toBe(amount);

    // Cleanup — owner-only delete.
    await rawApi(
      `/api/members/${encodeURIComponent(memberId)}/payments/${encodeURIComponent(paymentId)}`,
      ownerToken,
      { method: 'DELETE' },
    );
  });
});
