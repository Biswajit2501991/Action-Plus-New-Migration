import { describe, expect, it } from 'vitest';
import { mergeMemberPatchResponse, pickMemberBillingSource } from '../src/features/members/memberBillingMerge.js';

describe('pickMemberBillingSource', () => {
  it('prefers local billing when billingDateUpdatedAt is newer', () => {
    const local = {
      billingDate: '2026-06-12',
      billingDateUpdatedAt: '2026-06-12T13:00:00.000Z',
    };
    const remote = {
      billingDate: '2026-05-12',
      billingDateUpdatedAt: '2026-05-12T10:00:00.000Z',
    };
    expect(pickMemberBillingSource(local, remote, remote).billingDate).toBe('2026-06-12');
  });
});

describe('mergeMemberPatchResponse', () => {
  it('keeps local billing when server response is stale', () => {
    const local = {
      memberId: 'APG-1',
      billingDate: '2026-06-12',
      billingDateUpdatedAt: '2026-06-12T13:00:00.000Z',
      name: 'Local Name',
    };
    const server = {
      memberId: 'APG-1',
      billingDate: '2026-05-12',
      billingDateUpdatedAt: '2026-05-12T10:00:00.000Z',
      name: 'Server Name',
    };
    const merged = mergeMemberPatchResponse(local, server);
    expect(merged.billingDate).toBe('2026-06-12');
    expect(merged.name).toBe('Server Name');
  });
});
