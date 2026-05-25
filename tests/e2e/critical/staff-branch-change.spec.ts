import { test, expect } from '../fixtures/auth.fixture';
import { buildStaffUser } from '../factories/staff.factory';
import { listGymCodes, listStaff, upsertStaff } from '../utils/api-client';

test.describe('@critical @regression Staff gym branch assignment', () => {
  test('API: create staff with gymCodeId and change branch on update', async ({ ownerToken }) => {
    const codes = await listGymCodes(ownerToken);
    if (codes.length < 1) {
      test.skip(true, 'No gym codes in Supabase — run supabase_gym_codes.sql');
    }
    const first = codes[0];
    const second = codes[1] || codes[0];
    const staff = buildStaffUser({
      gymCodeId: first.id,
      sections: ['Dashboard', 'Members'],
    });

    await upsertStaff(ownerToken, staff);

    const withBranch = { ...staff, gymCodeId: second.id, updatedAt: new Date().toISOString() };
    await upsertStaff(ownerToken, withBranch);

    const remote = await listStaff(ownerToken);
    const row = remote.find((u) => u.id === staff.id) as { gymCodeId?: string } | undefined;
    expect(row, 'staff must exist after branch change').toBeTruthy();
    expect(String(row?.gymCodeId || '')).toBe(String(second.id));
  });
});
