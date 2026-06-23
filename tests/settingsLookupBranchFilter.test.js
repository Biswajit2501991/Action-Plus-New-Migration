import { describe, expect, it } from 'vitest';
import {
  filterSettingsLookupRowsForAuth,
  filterSettingsStaffForAuth,
} from '../backend/src/db/supabase/settingsLookupBranchFilter.js';
import { filterLookupRowsForGymCodeId } from '../backend/src/db/supabase/settingsLookupBranchId.js';

describe('settingsLookupBranchFilter (Option 2 strict)', () => {
  const branchA = 'branch-a-uuid';
  const branchB = 'branch-b-uuid';
  const hq = 'hq-uuid';

  const rows = [
    { value: 'HQ Plan', created_by_gym_code_id: hq },
    { value: 'Branch A Plan', created_by_gym_code_id: branchA },
    { value: 'Branch B Plan', created_by_gym_code_id: branchB },
  ];

  it('shows only active branch rows (no cross-branch globals)', () => {
    const auth = { userId: 'owner', staffRole: 'master_owner', activeBranchId: branchA, gymCodeId: branchA };
    expect(filterSettingsLookupRowsForAuth(rows, auth).map((r) => r.value)).toEqual(['Branch A Plan']);
  });

  it('hides other branch rows for staff on branch B', () => {
    const auth = {
      userId: 'sam',
      staffRole: 'staff',
      allowedBranchIds: [branchB],
      activeBranchId: branchB,
      gymCodeId: branchB,
    };
    expect(filterSettingsLookupRowsForAuth(rows, auth).map((r) => r.value)).toEqual(['Branch B Plan']);
  });

  it('returns all rows when no active branch is set', () => {
    const auth = { userId: 'owner', staffRole: 'master_owner' };
    expect(filterSettingsLookupRowsForAuth(rows, auth)).toHaveLength(3);
  });

  it('filterLookupRowsForGymCodeId isolates by gym_code_id', () => {
    expect(filterLookupRowsForGymCodeId(rows, branchA).map((r) => r.value)).toEqual(['Branch A Plan']);
  });

  it('filters settings.staff directory by staff branch login map', () => {
    const auth = { userId: 'raja', staffRole: 'branch_owner', activeBranchId: branchA, gymCodeId: branchA };
    const staff = [{ id: 'deep', name: 'Deep' }, { id: 'sam', name: 'Sam' }];
    const staffMap = new Map([['deep', branchA], ['sam', branchB]]);
    const aliasMap = new Map([['deep', 'deep'], ['sam', 'sam']]);
    expect(filterSettingsStaffForAuth(staff, auth, staffMap, aliasMap).map((s) => s.id)).toEqual(['deep']);
  });
});
