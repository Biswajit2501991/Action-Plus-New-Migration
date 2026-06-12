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
  it('strips signed URLs from photo but keeps hasPhoto on PATCH merge', () => {
    const prev = global.window;
    global.window = { __APG_ENV__: { MEMBER_PHOTO_STORAGE_ENABLED: true } };
    const local = {
      memberId: 'APG-1',
      photo: 'https://cdn.example/photo.jpg',
      photoVersion: 2,
      hasPhoto: true,
    };
    const server = {
      memberId: 'APG-1',
      photo: '',
      photoVersion: 2,
      hasPhoto: true,
    };
    const merged = mergeMemberPatchResponse(local, server);
    expect(merged.photo).toBe('');
    expect(merged.hasPhoto).toBe(true);
    expect(merged.photoVersion).toBe(2);
    global.window = prev;
  });

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
