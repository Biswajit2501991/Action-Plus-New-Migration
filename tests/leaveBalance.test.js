import { describe, expect, it } from 'vitest';
import {
  annualLeaveBalanceRemaining,
  approvedLeaveDaysUsed,
  buildStaffLoginAliasMap,
  adjustmentDaysForStaff,
  applyGlobalAdjustmentPreview,
} from '../src/features/leave/leaveBalance.js';
import { mergeLeaveRequestsFromPull, normalizeLeaveRequestFromApi } from '../src/features/leave/leaveApprovalSync.js';

describe('leaveBalance', () => {
  const staff = [
    { id: 'biswajit', name: 'Biswajit Kumar', email: 'biswajit@example.com' },
    { id: 'raja', name: 'Raja', email: 'raja@example.com' },
  ];
  const aliasMap = buildStaffLoginAliasMap(staff);

  it('subtracts approved leave days from base allocation', () => {
    const leave = [{
      id: 'a1',
      userId: 'biswajit',
      status: 'Approved',
      startDate: '2026-06-01',
      endDate: '2026-06-02',
    }];
    expect(annualLeaveBalanceRemaining(leave, 'biswajit', { year: 2026, aliasMap })).toBe(22);
  });

  it('matches leave userId by display-name alias', () => {
    const leave = [{
      id: 'a1',
      userId: 'Biswajit Kumar',
      status: 'Approved',
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    }];
    expect(approvedLeaveDaysUsed(leave, 'biswajit', 2026, aliasMap)).toBe(1);
    expect(annualLeaveBalanceRemaining(leave, 'biswajit', { year: 2026, aliasMap })).toBe(23);
  });

  it('applies global adjustment ledger entries', () => {
    const adjustments = [{ calendarYear: 2026, adjustmentDays: 2, scope: 'global' }];
    expect(adjustmentDaysForStaff(adjustments, 'biswajit', 2026)).toBe(2);
    expect(annualLeaveBalanceRemaining([], 'biswajit', {
      year: 2026,
      adjustments,
      aliasMap,
    })).toBe(26);
  });

  it('preview global adjustment rows', () => {
    const rows = [{ userId: 'biswajit', name: 'Biswajit', current: 22 }];
    const next = applyGlobalAdjustmentPreview(rows, 2);
    expect(next[0].next).toBe(24);
  });

  it('uses date range when days is zero', () => {
    const normalized = normalizeLeaveRequestFromApi({
      userId: 'biswajit',
      status: 'Approved',
      startDate: '2026-06-01',
      endDate: '2026-06-02',
      days: 0,
    });
    expect(normalized.days).toBe(2);
  });
});

describe('mergeLeaveRequestsFromPull union', () => {
  it('keeps local rows missing from remote', () => {
    const prev = [
      { id: 'local-only', userId: 'biswajit', status: 'Approved', startDate: '2026-06-01', endDate: '2026-06-01' },
      { id: 'shared', userId: 'raja', status: 'Pending', startDate: '2026-06-03', endDate: '2026-06-03' },
    ];
    const remote = [
      { id: 'shared', userId: 'raja', status: 'Approved', startDate: '2026-06-03', endDate: '2026-06-03' },
    ];
    const merged = mergeLeaveRequestsFromPull(prev, remote);
    expect(merged).toHaveLength(2);
    expect(merged.find((r) => r.id === 'local-only')?.status).toBe('Approved');
    expect(merged.find((r) => r.id === 'shared')?.status).toBe('Approved');
  });
});
