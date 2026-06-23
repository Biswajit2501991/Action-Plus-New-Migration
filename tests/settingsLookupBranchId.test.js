import { describe, expect, it } from 'vitest';
import { filterLookupRowsForGymCodeId, lookupRowGymCodeId } from '../src/features/settings/settingsLookupBranchId.js';

describe('settingsLookupBranchId (Option 2)', () => {
  const branchA = 'a';
  const branchB = 'b';

  it('reads gym code from row variants', () => {
    expect(lookupRowGymCodeId({ created_by_gym_code_id: branchA })).toBe(branchA);
    expect(lookupRowGymCodeId({ createdByGymCodeId: branchB })).toBe(branchB);
  });

  it('filters to single branch', () => {
    const rows = [
      { value: 'Plan A', created_by_gym_code_id: branchA },
      { value: 'Plan B', created_by_gym_code_id: branchB },
    ];
    expect(filterLookupRowsForGymCodeId(rows, branchA).map((r) => r.value)).toEqual(['Plan A']);
  });
});
