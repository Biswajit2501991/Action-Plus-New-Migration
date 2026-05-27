import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/supabase/client.js', () => ({
  getSupabase: vi.fn(),
  gymId: vi.fn(() => 'gym-1'),
}));

import { getSupabase } from '../../db/supabase/client.js';
import { loadAllowedBranchIdsForStaffRow } from './branchAssignments.js';

describe('loadAllowedBranchIdsForStaffRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to gym_code_id when assignments query errors', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'relation "staff_branch_assignments" does not exist' },
      }),
    };
    getSupabase.mockReturnValue({ from: vi.fn(() => chain) });
    const ids = await loadAllowedBranchIdsForStaffRow({
      id: 'staff-pk-1',
      gym_code_id: 'branch-home',
    });
    expect(ids).toEqual(['branch-home']);
  });

  it('returns assignment gym_code_ids when query succeeds', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          { gym_code_id: 'b2', is_primary: false },
          { gym_code_id: 'b1', is_primary: true },
        ],
        error: null,
      }),
    };
    getSupabase.mockReturnValue({ from: vi.fn(() => chain) });
    const ids = await loadAllowedBranchIdsForStaffRow({
      id: 'staff-pk-2',
      gym_code_id: 'b1',
    });
    expect(ids).toEqual(['b2', 'b1']);
  });
});
