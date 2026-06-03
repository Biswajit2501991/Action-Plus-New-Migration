import { describe, it, expect, vi } from 'vitest';
import { pickMergedPaymentHistory } from '../src/features/members/paymentHistoryMerge.js';

function mergePaymentHistoryArrays(local, remote, cap = 120) {
  const seen = new Set();
  const out = [];
  for (const row of [...local, ...remote]) {
    const id = String(row?.id || row?.paymentId || '').trim();
    const key = id || JSON.stringify(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out.slice(0, cap);
}

describe('pickMergedPaymentHistory', () => {
  const localRow = {
    memberId: 'M-1',
    paymentHistory: [{ id: 'p-local', amount: 100, paidAt: '2026-05-01T10:00:00.000Z' }],
  };
  const remoteRow = {
    memberId: 'M-1',
    paymentHistory: [{ id: 'p-remote', amount: 200, paidAt: '2026-05-02T10:00:00.000Z' }],
  };

  it('merges both sides when remote is newer (does not replace with remote only)', () => {
    const out = pickMergedPaymentHistory(localRow, remoteRow, {
      mergeArrays: mergePaymentHistoryArrays,
    });
    expect(out.map((r) => r.id).sort()).toEqual(['p-local', 'p-remote']);
  });

  it('keeps local when sync is pending for member', () => {
    const out = pickMergedPaymentHistory(localRow, remoteRow, {
      syncPending: { 'M-1': true },
      mergeArrays: mergePaymentHistoryArrays,
    });
    expect(out).toEqual(localRow.paymentHistory);
  });

  it('keeps local when remote list is slim and empty', () => {
    const out = pickMergedPaymentHistory(localRow, { memberId: 'M-1', __listSlim: true, paymentHistory: [] }, {
      mergeArrays: mergePaymentHistoryArrays,
    });
    expect(out).toEqual(localRow.paymentHistory);
  });
});
