import { describe, it, expect } from 'vitest';
import {
  staffRowToApp,
  appStaffToRow,
  memberRowToApp,
  appMemberToRow,
  visitorRowToApp,
  appVisitorToRow,
} from '../backend/src/db/supabase/mappers.js';

describe('staff mapper carries gymCodeId in both directions', () => {
  it('staffRowToApp exposes row.gym_code_id as gymCodeId', () => {
    const row = {
      staff_login_id: 'deep',
      full_name: 'Deep',
      gym_code_id: 'gc-abc',
      created_at: '2024-01-01',
      updated_at: '2024-01-01',
    };
    expect(staffRowToApp(row, [], {}).gymCodeId).toBe('gc-abc');
  });

  it('staffRowToApp returns null when no code', () => {
    const row = { staff_login_id: 'x', full_name: 'X', created_at: '2024', updated_at: '2024' };
    expect(staffRowToApp(row, [], {}).gymCodeId).toBeNull();
  });

  it('staffRowToApp uses assignedBranchIds when provided', () => {
    const row = { staff_login_id: 'bo', full_name: 'BO', gym_code_id: 'gc-1', staff_role: 'branch_owner', created_at: '2024', updated_at: '2024' };
    expect(staffRowToApp(row, [], {}, ['gc-1', 'gc-2']).assignedBranchIds).toEqual(['gc-1', 'gc-2']);
  });

  it('staffRowToApp falls back to gym_code_id for assignedBranchIds', () => {
    const row = { staff_login_id: 's', full_name: 'S', gym_code_id: 'gc-9', created_at: '2024', updated_at: '2024' };
    expect(staffRowToApp(row, [], {}).assignedBranchIds).toEqual(['gc-9']);
  });

  it('appStaffToRow trims and persists gymCodeId', () => {
    const row = appStaffToRow({ id: 'deep', name: 'Deep', gymCodeId: '  gc-abc  ' }, 'gym-1');
    expect(row.gym_code_id).toBe('gc-abc');
  });

  it('appStaffToRow omits gym_code_id when missing (lets DB default kick in)', () => {
    const row = appStaffToRow({ id: 'deep', name: 'Deep' }, 'gym-1');
    expect(row.gym_code_id).toBeUndefined();
  });
});

describe('member mapper carries assignedGymCodeId in both directions', () => {
  it('memberRowToApp exposes row.assigned_gym_code_id', () => {
    const row = {
      id: 'm-1',
      member_code: 'APG-1',
      full_name: 'Test',
      assigned_gym_code_id: 'gc-xyz',
      created_at: '2024',
      updated_at: '2024',
    };
    expect(memberRowToApp(row).assignedGymCodeId).toBe('gc-xyz');
  });

  it('memberRowToApp slim list includes payment history when provided', () => {
    const row = {
      id: 'm-1',
      member_code: 'APG-1',
      full_name: 'Test',
      amount: 1200,
      created_at: '2024',
      updated_at: '2024',
    };
    const app = memberRowToApp(row, {
      payments: [{ id: 'p1', paidAt: '2026-05-10T00:00:00.000Z', amount: 1200 }],
    }, { slim: true });
    expect(app.__listSlim).toBe(true);
    expect(app.paymentHistory).toHaveLength(1);
    expect(app.paymentHistory[0].amount).toBe(1200);
  });

  it('appMemberToRow persists assignedGymCodeId trimmed', () => {
    const row = appMemberToRow({ memberId: 'APG-1', name: 'Test', assignedGymCodeId: '  gc-xyz  ' }, 'gym-1');
    expect(row.assigned_gym_code_id).toBe('gc-xyz');
  });

  it('appMemberToRow nullifies missing assignedGymCodeId', () => {
    const row = appMemberToRow({ memberId: 'APG-1', name: 'Test' }, 'gym-1');
    expect(row.assigned_gym_code_id).toBeNull();
  });
});

describe('visitor mapper carries assignedGymCodeId in both directions', () => {
  it('visitorRowToApp exposes row.assigned_gym_code_id', () => {
    const row = { external_visitor_id: 'V-1', full_name: 'Vis', assigned_gym_code_id: 'gc-v' };
    expect(visitorRowToApp(row).assignedGymCodeId).toBe('gc-v');
  });

  it('appVisitorToRow persists assignedGymCodeId trimmed', () => {
    const row = appVisitorToRow({ id: 'V-1', fullName: 'Vis', assignedGymCodeId: '  gc-v  ' }, 'gym-1');
    expect(row.assigned_gym_code_id).toBe('gc-v');
  });

  it('appVisitorToRow nullifies missing assignedGymCodeId', () => {
    const row = appVisitorToRow({ id: 'V-1', fullName: 'Vis' }, 'gym-1');
    expect(row.assigned_gym_code_id).toBeNull();
  });
});
