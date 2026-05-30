import { describe, expect, it } from 'vitest';
import {
  filterLeaveRequestsForAuth,
  filterPtClientProfilesForAuth,
  filterRoleTemplatesForAuth,
  canReadSettingsScope,
  stripSensitiveSettingsForAuth,
} from './settingsBranchFilter.js';

describe('settingsBranchFilter (V-005)', () => {
  const branchA = 'branch-a-uuid';
  const branchB = 'branch-b-uuid';

  it('branch admin sees leave only for staff in active branch', () => {
    const auth = {
      userId: 'raja',
      staffRole: 'branch_owner',
      roles: ['branch_owner'],
      allowedBranchIds: [branchA, branchB],
      activeBranchId: branchA,
      gymCodeId: branchA,
    };
    const staffMap = new Map([
      ['deep', branchA],
      ['sam', branchB],
    ]);
    const leave = [
      { userId: 'deep', type: 'Casual' },
      { userId: 'sam', type: 'Sick' },
    ];
    const filtered = filterLeaveRequestsForAuth(leave, auth, staffMap);
    expect(filtered.map((r) => r.userId)).toEqual(['deep']);
  });

  it('regular staff sees only own leave requests', () => {
    const auth = {
      userId: 'deep',
      staffRole: 'staff',
      roles: ['staff'],
      allowedBranchIds: [branchA],
      gymCodeId: branchA,
    };
    const staffMap = new Map([
      ['deep', branchA],
      ['sam', branchA],
    ]);
    const leave = [
      { userId: 'deep', type: 'Casual' },
      { userId: 'sam', type: 'Sick' },
    ];
    expect(filterLeaveRequestsForAuth(leave, auth, staffMap)).toEqual([{ userId: 'deep', type: 'Casual' }]);
  });

  it('filters PT profiles by member branch', () => {
    const auth = {
      userId: 'raja',
      staffRole: 'branch_owner',
      allowedBranchIds: [branchA],
      activeBranchId: branchA,
      gymCodeId: branchA,
    };
    const memberMap = new Map([
      ['M001', branchA],
      ['M002', branchB],
    ]);
    const profiles = { M001: { plan: 1 }, M002: { plan: 2 } };
    expect(filterPtClientProfilesForAuth(profiles, auth, memberMap)).toEqual({ M001: { plan: 1 } });
  });

  it('hides role templates from non-admin staff', () => {
    const auth = { userId: 'deep', staffRole: 'staff', roles: ['staff'], gymCodeId: branchA };
    const templates = [{ id: 't1', title: 'Front Desk' }];
    expect(filterRoleTemplatesForAuth(templates, auth)).toEqual([]);
  });

  it('gates leave and pt scopes by access flags', () => {
    const staffAccess = {
      leave: { viewLeaveRequests: false },
      ptClients: { viewPtClients: true },
    };
    expect(canReadSettingsScope({ userId: 'deep' }, staffAccess, 'core')).toBe(true);
    expect(canReadSettingsScope({ userId: 'deep' }, staffAccess, 'leave')).toBe(false);
    expect(canReadSettingsScope({ userId: 'deep' }, staffAccess, 'pt')).toBe(true);
  });

  it('strips sensitive keys on full scope when access flags off', () => {
    const auth = { userId: 'deep', staffRole: 'staff', gymCodeId: branchA };
    const staffAccess = {
      leave: { viewLeaveRequests: false },
      ptClients: { viewPtClients: false },
    };
    const out = stripSensitiveSettingsForAuth({
      plans: ['Basic'],
      leaveRequests: [{ userId: 'x' }],
      ptClientProfiles: { M1: {} },
      roleTemplates: [{ id: 't1' }],
    }, auth, staffAccess);
    expect(out.plans).toEqual(['Basic']);
    expect(out.leaveRequests).toEqual([]);
    expect(out.ptClientProfiles).toEqual({});
    expect(out.roleTemplates).toEqual([]);
  });
});
