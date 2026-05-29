import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { resolveRoleHierarchy } from '../backend/src/auth/tenant/roleHierarchyResolver.js';
import {
  engineCanListStaff,
  engineCanManageStaff,
  engineIsBranchOwner,
  engineIsMasterOwner,
} from '../backend/src/auth/tenant/scopedAuthorizationEngine.js';

describe('resolveRoleHierarchy', () => {
  it('master owner by login id', () => {
    const h = resolveRoleHierarchy({ userId: 'owner', roles: ['owner'], staffRole: 'master_owner' });
    expect(h.isMasterOwner).toBe(true);
    expect(h.isBranchAdmin).toBe(true);
    expect(h.isStaff).toBe(false);
  });

  it('branch owner by staffRole without env flag', () => {
    const h = resolveRoleHierarchy({ userId: 'biswajit', staffRole: 'branch_owner', roles: ['branch_owner'] });
    expect(h.isBranchOwner).toBe(true);
    expect(h.isBranchAdmin).toBe(true);
    expect(h.isMasterOwner).toBe(false);
  });

  it('regular staff', () => {
    const h = resolveRoleHierarchy({ userId: 'biswajit', staffRole: 'staff', roles: ['staff'] });
    expect(h.isStaff).toBe(true);
    expect(h.isBranchAdmin).toBe(false);
    expect(h.isMasterOwner).toBe(false);
  });
});

describe('scopedAuthorizationEngine staff APIs', () => {
  const branchOwner = { userId: 'mgr', staffRole: 'branch_owner', roles: ['branch_owner'] };
  const staff = { userId: 'biswajit', staffRole: 'staff', roles: ['staff'] };
  const master = { userId: 'owner', staffRole: 'master_owner', roles: ['owner'] };

  it('branch owner can list and manage staff', () => {
    expect(engineCanListStaff(branchOwner)).toBe(true);
    expect(engineCanManageStaff(branchOwner)).toBe(true);
    expect(engineIsBranchOwner(branchOwner)).toBe(true);
  });

  it('regular staff cannot list or manage staff', () => {
    expect(engineCanListStaff(staff)).toBe(false);
    expect(engineCanManageStaff(staff)).toBe(false);
  });

  it('master owner can list and manage staff', () => {
    expect(engineCanListStaff(master)).toBe(true);
    expect(engineCanManageStaff(master)).toBe(true);
    expect(engineIsMasterOwner(master)).toBe(true);
  });
});

describe('branch owner role without BRANCH_OWNER_ENABLED', () => {
  beforeEach(() => {
    vi.stubEnv('BRANCH_OWNER_ENABLED', 'false');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('engine still recognizes branch owner role', async () => {
    const { authIsBranchOwner, authIsBranchAdmin } = await import('../backend/src/auth/tenant/scopedAuth.js');
    const auth = { userId: 'raja', staffRole: 'branch_owner', roles: ['branch_owner'] };
    expect(authIsBranchOwner(auth)).toBe(true);
    expect(authIsBranchAdmin(auth)).toBe(true);
  });
});
