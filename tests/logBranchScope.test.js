import { describe, it, expect } from 'vitest';
import { logMatchesBranchScope } from '../backend/src/auth/branchFilter.js';

describe('logMatchesBranchScope', () => {
  const scope = {
    limited: true,
    memberCodes: new Set(['MEM-1']),
    staffLogins: new Set(['staff-a']),
    visitorIds: new Set(['VIS-1']),
  };

  it('allows member-scoped logs in branch', () => {
    expect(
      logMatchesBranchScope(
        { entityType: 'member', entityId: 'MEM-1', action: 'member.updated' },
        scope,
      ),
    ).toBe(true);
  });

  it('allows logs when actor is branch staff even without entity match', () => {
    expect(
      logMatchesBranchScope(
        { entityType: 'settings', entityId: 'x', action: 'settings.saved', actor: 'staff-a' },
        scope,
      ),
    ).toBe(true);
  });

  it('rejects unrelated logs without branch actor', () => {
    expect(
      logMatchesBranchScope(
        { entityType: 'member', entityId: 'OTHER-MEM', action: 'member.updated', actor: 'other' },
        scope,
      ),
    ).toBe(false);
  });

  it('matches logs stamped with branch_id', () => {
    expect(
      logMatchesBranchScope(
        { branchId: 'branch-x', action: 'settings.saved', entityType: 'settings', entityId: 'x' },
        { limited: true, gymCodeId: 'branch-x', memberCodes: new Set(), staffLogins: new Set(), visitorIds: new Set() },
      ),
    ).toBe(true);
    expect(
      logMatchesBranchScope(
        { branchId: 'branch-y', action: 'settings.saved', entityType: 'settings', entityId: 'x' },
        { limited: true, gymCodeId: 'branch-x', memberCodes: new Set(), staffLogins: new Set(), visitorIds: new Set() },
      ),
    ).toBe(false);
  });

  it('passes through when scope is not limited', () => {
    expect(
      logMatchesBranchScope(
        { entityType: 'settings', entityId: 'x', action: 'settings.saved' },
        { limited: false },
      ),
    ).toBe(true);
  });
});
