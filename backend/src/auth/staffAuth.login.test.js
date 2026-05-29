import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/supabase/client.js', () => ({
  getSupabase: vi.fn(),
  gymId: vi.fn(() => 'gym-1'),
}));

vi.mock('./passwords.js', () => ({
  verifyPassword: vi.fn(async () => true),
  hashPassword: vi.fn(),
}));

vi.mock('./tenant/branchAssignments.js', () => ({
  resolveStaffBranchContext: vi.fn(async () => {
    throw new Error('assignments table missing');
  }),
  loadAllowedBranchIdsForStaffRow: vi.fn(async (row) => (
    row?.gym_code_id ? [String(row.gym_code_id)] : []
  )),
}));

import { getSupabase } from '../db/supabase/client.js';
import { loginStaff } from './staffAuth.js';

describe('loginStaff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('still succeeds when branch context resolution throws', async () => {
    const staffRow = {
      id: 42,
      staff_login_id: 'deep',
      gym_id: 'gym-1',
      gym_code_id: 'branch-1',
      is_blocked: false,
      password_hash: 'plain',
      staff_role: 'staff',
    };
    const sectionsChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [{ section_name: 'Members' }], error: null }),
    };
    const accessChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [{ access_json: {} }], error: null }),
    };
    const staffUsersChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [staffRow], error: null }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    };
    getSupabase.mockReturnValue({
      from: vi.fn((table) => {
        if (table === 'staff_users') return staffUsersChain;
        if (table === 'staff_user_sections') return sectionsChain;
        if (table === 'staff_user_access') return accessChain;
        return staffUsersChain;
      }),
    });

    const result = await loginStaff('deep', 'secret');
    expect(result.ok).toBe(true);
    expect(result.token).toBeTruthy();
    expect(result.user?.id).toBe('deep');
  });
});
