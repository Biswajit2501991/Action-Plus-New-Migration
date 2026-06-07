import { describe, expect, it } from 'vitest';
import {
  mergeLeaveRequestIntoList,
  mergeApprovedLeaveIntoAttendance,
  normalizeLeaveRequestFromApi,
  annualLeaveBalanceRemaining,
  mergeLeaveRequestsFromPull,
} from '../src/features/leave/leaveApprovalSync.js';
import { createLeaveApprovalHandlers } from '../src/features/leave/leaveApprovalHandlers.js';

describe('leaveApprovalSync', () => {
  it('merges updated request by id', () => {
    const list = [{ id: 'a', status: 'Pending' }, { id: 'b', status: 'Pending' }];
    const next = mergeLeaveRequestIntoList(list, { id: 'a', status: 'Approved' });
    expect(next[0].status).toBe('Approved');
    expect(next[1].status).toBe('Pending');
  });

  it('syncs approved leave into attendance', () => {
    const next = mergeApprovedLeaveIntoAttendance([], {
      id: 'lr-1',
      userId: 'staff1',
      type: 'Casual',
      startDate: '2026-06-01',
      endDate: '2026-06-02',
    }, 'owner');
    expect(next.length).toBe(2);
    expect(next.every((r) => r.status === 'Leave')).toBe(true);
  });

  it('computes annual balance from dates when days missing', () => {
    const leave = [{
      id: 'a1',
      userId: 'biswajit',
      status: 'Approved',
      startDate: '2026-06-01',
      endDate: '2026-06-01',
    }];
    expect(annualLeaveBalanceRemaining(leave, 'Biswajit')).toBe(23);
  });

  it('mergeLeaveRequestsFromPull keeps prev when remote empty', () => {
    const prev = [{ id: 'x', userId: 'deep', status: 'Approved', startDate: '2026-06-01', endDate: '2026-06-01' }];
    expect(mergeLeaveRequestsFromPull(prev, [])).toEqual([expect.objectContaining({ id: 'x', days: 1 })]);
  });

  it('mergeLeaveRequestsFromPull replaces with normalized remote rows', () => {
    const prev = [{ id: 'old', userId: 'deep', status: 'Pending' }];
    const remote = [{ id: 'new', userId: 'deep', status: 'Approved', startDate: '2026-06-01', endDate: '2026-06-02' }];
    const merged = mergeLeaveRequestsFromPull(prev, remote);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('new');
    expect(merged[0].days).toBe(2);
  });
});

describe('createLeaveApprovalHandlers', () => {
  it('persists via PATCH then updates local lists', async () => {
    const patches = [];
    let leave = [{ id: 'x1', userId: 's1', status: 'Pending', startDate: '2026-06-01', endDate: '2026-06-01' }];
    let attendance = [];
    const handlers = createLeaveApprovalHandlers({
      backendJson: async (path, init) => {
        patches.push({ path, init });
        return { ok: true, request: { id: 'x1', userId: 's1', status: 'Approved', startDate: '2026-06-01', endDate: '2026-06-01' } };
      },
      getLeaveRequests: () => leave,
      updateLeaveRequests: (fn) => { leave = fn(leave); },
      updateStaffAttendance: (fn) => { attendance = fn(attendance); },
      getActor: () => 'owner',
    });
    const result = await handlers.approveLeaveRequest('x1', { source: 'test' });
    expect(result.ok).toBe(true);
    expect(patches).toHaveLength(1);
    expect(leave[0].status).toBe('Approved');
    expect(attendance.length).toBe(1);
  });
});
