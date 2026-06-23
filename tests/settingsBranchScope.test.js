import { describe, expect, it } from 'vitest';
import {
  clearSettingsLookups,
  filterUsersForActiveBranchDisplay,
  mergeSettingsLookupsForBranchReplace,
  mergeSettingsLookupList,
  staffFilterOptionsForActiveBranch,
} from '../src/features/settings/settingsBranchScope.js';

describe('settingsBranchScope', () => {
  const branchA = 'branch-a';
  const branchB = 'branch-b';

  it('replaces lookup arrays on branch switch merge', () => {
    const prev = { plans: ['Old A', 'Old B'], fineSmsEnabled: true };
    const remote = { plans: ['Global', 'Branch B Only'], statuses: ['Active'] };
    const merged = mergeSettingsLookupsForBranchReplace(prev, remote);
    expect(merged.plans).toEqual(['Global', 'Branch B Only']);
    expect(merged.statuses).toEqual(['Active']);
    expect(merged.fineSmsEnabled).toBe(true);
  });

  it('clears lookup keys while preserving other settings', () => {
    const out = clearSettingsLookups({ plans: ['A'], fineSmsEnabled: false, staff: [{ id: 'x' }] });
    expect(out.plans).toEqual([]);
    expect(out.fineSmsEnabled).toBe(false);
    expect(out.staff).toHaveLength(1);
  });

  it('filters users to active branch for master owner in branch context', () => {
    const owner = { id: 'owner', staffRole: 'master_owner', activeBranchId: branchA, gymCodeId: branchA };
    const users = [
      { id: 'a', gymCodeId: branchA, name: 'Ann' },
      { id: 'b', gymCodeId: branchB, name: 'Bob' },
    ];
    expect(filterUsersForActiveBranchDisplay(owner, users, branchA).map((u) => u.id)).toEqual(['a']);
  });

  it('builds staff filter options from branch users and members only', () => {
    const owner = { id: 'owner', staffRole: 'master_owner', activeBranchId: branchA, gymCodeId: branchA };
    const options = staffFilterOptionsForActiveBranch({
      user: owner,
      activeBranchId: branchA,
      users: [
        { id: 'a', gymCodeId: branchA, name: 'Ann' },
        { id: 'b', gymCodeId: branchB, name: 'Bob' },
      ],
      members: [{ staff: 'Member Coach' }],
      settingsStaff: [{ id: 'legacy', name: 'Legacy Staff' }],
    });
    expect(options).toEqual(['Ann', 'Member Coach']);
  });

  it('mergeSettingsLookupList unions local values missing from remote pull', () => {
    const merged = mergeSettingsLookupList(
      ['Global', 'Plan B'],
      ['Global'],
      false,
    );
    expect(merged).toEqual(['Global', 'Plan B']);
  });
});
