import { test, expect } from '../fixtures/auth.fixture';
import { apiHealthOk, apiJson, rawApi } from '../utils/api-client';

/**
 * Payment delete must hit DELETE /api/members/:id/payments/:paymentId and only
 * show success when the DB row is removed. Simulates API failure → row stays.
 */
test.describe('@critical Payment delete persistence', () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async () => {
    const ok = await apiHealthOk();
    test.skip(!ok && process.env.E2E_REQUIRE_BACKEND !== '0', 'Backend+Supabase required');
  });

  test('API failure: DELETE 404 does not claim success', async ({ ownerToken }) => {
    const res = await rawApi(
      '/api/members/e2e-nonexistent-member/payments/e2e-fake-payment-id',
      ownerToken,
      { method: 'DELETE' },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.deleted).toBe(false);
  });

  test('owner: delete payment via API removes row from GET /members', async ({ ownerToken }) => {
    const members = await apiJson<Array<{
      memberId: string;
      paymentHistory?: Array<{ id: string; paidAt?: string; amount?: number }>;
    }>>('/api/members', ownerToken);

    const withPayments = (members || []).find(
      (m) => Array.isArray(m.paymentHistory) && m.paymentHistory.length > 0 && m.paymentHistory[0]?.id,
    );
    test.skip(!withPayments, 'No member with payment history in gym — seed one manually');

    const memberId = withPayments!.memberId;
    const paymentId = String(withPayments!.paymentHistory![0].id);

    const del = await apiJson<{ ok: boolean; deleted: boolean; member: { paymentHistory?: unknown[] } }>(
      `/api/members/${encodeURIComponent(memberId)}/payments/${encodeURIComponent(paymentId)}`,
      ownerToken,
      { method: 'DELETE' },
    );
    expect(del.ok).toBe(true);
    expect(del.deleted).toBe(true);
    const remaining = (del.member.paymentHistory || []).map((p: { id?: string }) => String(p?.id || ''));
    expect(remaining).not.toContain(paymentId);

    const refetched = await apiJson<typeof withPayments>(
      `/api/members`,
      ownerToken,
    );
    const again = (refetched || []).find((m) => m.memberId === memberId);
    const ids = (again?.paymentHistory || []).map((p) => String(p.id || ''));
    expect(ids).not.toContain(paymentId);
  });
});
