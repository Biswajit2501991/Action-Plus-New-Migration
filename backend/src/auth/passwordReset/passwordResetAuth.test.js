import { describe, expect, it } from 'vitest';
import { buildPasswordResetDecisionAuth } from './passwordResetAuth.js';
import { engineCanManageStaff } from '../tenant/scopedAuthorizationEngine.js';
import { assertActorCanDecideForStaff } from './passwordResetDecisionEngine.js';

describe('passwordResetAuth (V-004)', () => {
  it('uses DB staffRole instead of stale JWT branch_owner elevation', () => {
    const claims = {
      userId: 'deep',
      roles: ['branch_owner'],
      staffRole: 'branch_owner',
      allowedBranchIds: ['b1', 'b2'],
    };
    const profile = {
      user: { id: 'deep', blocked: false, staffRole: 'staff' },
      tokenCtx: { staffRole: 'staff', allowedBranchIds: ['b1'] },
      allowedBranchIds: ['b1'],
      activeBranchId: 'b1',
      gymCodeId: 'b1',
      claimsStale: true,
    };
    const auth = buildPasswordResetDecisionAuth(claims, profile);
    expect(auth.staffRole).toBe('staff');
    expect(auth.roles).toEqual(['staff']);
    expect(auth.allowedBranchIds).toEqual(['b1']);
    expect(auth.claimsStale).toBe(true);
    expect(engineCanManageStaff(auth)).toBe(false);
  });

  it('allows master owner from DB profile even when JWT omits roles', () => {
    const claims = { userId: 'owner', roles: [], allowedBranchIds: [] };
    const profile = {
      user: { id: 'owner', blocked: false, staffRole: 'master_owner' },
      tokenCtx: { staffRole: 'master_owner', allowedBranchIds: ['hq'] },
      allowedBranchIds: ['hq'],
      activeBranchId: 'hq',
      gymCodeId: 'hq',
      claimsStale: false,
    };
    const auth = buildPasswordResetDecisionAuth(claims, profile);
    expect(engineCanManageStaff(auth)).toBe(true);
  });

  it('blocks cross-branch reset when DB scope shrinks', () => {
    const claims = {
      userId: 'raja',
      roles: ['branch_owner'],
      staffRole: 'branch_owner',
      allowedBranchIds: ['b1', 'b2'],
    };
    const profile = {
      user: { id: 'raja', blocked: false, staffRole: 'branch_owner' },
      tokenCtx: { staffRole: 'branch_owner', allowedBranchIds: ['b1'] },
      allowedBranchIds: ['b1'],
      activeBranchId: 'b1',
      gymCodeId: 'b1',
      claimsStale: true,
    };
    const auth = buildPasswordResetDecisionAuth(claims, profile);
    expect(() => assertActorCanDecideForStaff(auth, { id: 'staff2', gymCodeId: 'b2' })).toThrow(/cross-branch/);
    expect(() => assertActorCanDecideForStaff(auth, { id: 'staff1', gymCodeId: 'b1' })).not.toThrow();
  });
});
