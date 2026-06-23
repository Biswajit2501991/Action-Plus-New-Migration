import { describe, expect, it } from 'vitest';
import {
  resolveLookupDeleteRequesterForAuth,
  resolveLookupProvenanceForAuth,
} from '../backend/src/auth/tenant/lookupProvenance.js';

describe('lookupProvenance (Option 2)', () => {
  const branchA = 'branch-a-uuid';
  const branchB = 'branch-b-uuid';

  it('master owner in branch context creates branch-owned rows', () => {
    const auth = { userId: 'owner', staffRole: 'master_owner', activeBranchId: branchB, gymCodeId: branchB };
    expect(resolveLookupProvenanceForAuth(auth)).toEqual({
      createdByRole: 'branch_owner',
      createdByGymCodeId: branchB,
    });
  });

  it('master without active branch defers branch to HQ resolver', () => {
    const auth = { userId: 'owner', staffRole: 'master_owner' };
    expect(resolveLookupProvenanceForAuth(auth)).toEqual({
      createdByRole: 'branch_owner',
      createdByGymCodeId: null,
    });
  });

  it('delete requester uses master_owner role for owner with branch scope', () => {
    const auth = { userId: 'owner', staffRole: 'master_owner', activeBranchId: branchA, gymCodeId: branchA };
    expect(resolveLookupDeleteRequesterForAuth(auth)).toEqual({
      requesterRole: 'master_owner',
      requesterGymCodeId: branchA,
    });
  });

  it('staff in branch context stamps active branch', () => {
    const auth = {
      userId: 'sam',
      staffRole: 'staff',
      allowedBranchIds: [branchA],
      activeBranchId: branchA,
      gymCodeId: branchA,
    };
    expect(resolveLookupProvenanceForAuth(auth)).toEqual({
      createdByRole: 'staff',
      createdByGymCodeId: branchA,
    });
  });
});
