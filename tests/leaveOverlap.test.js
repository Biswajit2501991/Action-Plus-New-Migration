import { describe, expect, it } from 'vitest';
import {
  findLeaveDateConflicts,
  formatLeaveConflictDate,
  formatLeaveOverlapError,
  isBlockingLeaveStatus,
} from '../src/features/leave/leaveOverlap.js';

const existingAug = {
  id: 'lr-aug',
  userId: 'biswajit',
  status: 'Approved',
  startDate: '2026-08-10',
  endDate: '2026-08-12',
};

describe('isBlockingLeaveStatus', () => {
  it('blocks pending, approved, submitted, awaiting approval', () => {
    expect(isBlockingLeaveStatus('Pending')).toBe(true);
    expect(isBlockingLeaveStatus('Approved')).toBe(true);
    expect(isBlockingLeaveStatus('Submitted')).toBe(true);
    expect(isBlockingLeaveStatus('Awaiting Approval')).toBe(true);
  });

  it('allows rejected and cancelled', () => {
    expect(isBlockingLeaveStatus('Rejected')).toBe(false);
    expect(isBlockingLeaveStatus('Cancelled')).toBe(false);
  });
});

describe('findLeaveDateConflicts', () => {
  const rows = [existingAug];

  it('detects same single-day duplicate', () => {
    const hit = findLeaveDateConflicts('2026-08-10', '2026-08-10', rows, 'biswajit');
    expect(hit.hasConflict).toBe(true);
    expect(hit.conflicts).toEqual(['2026-08-10']);
  });

  it('detects each day inside existing range', () => {
    expect(findLeaveDateConflicts('2026-08-11', '2026-08-11', rows, 'biswajit').hasConflict).toBe(true);
    expect(findLeaveDateConflicts('2026-08-12', '2026-08-12', rows, 'biswajit').hasConflict).toBe(true);
  });

  it('detects partial overlaps at range edges', () => {
    expect(findLeaveDateConflicts('2026-08-09', '2026-08-11', rows, 'biswajit').conflicts).toEqual([
      '2026-08-10',
      '2026-08-11',
    ]);
    expect(findLeaveDateConflicts('2026-08-11', '2026-08-13', rows, 'biswajit').conflicts).toEqual([
      '2026-08-11',
      '2026-08-12',
    ]);
  });

  it('allows different staff on same date', () => {
    const hit = findLeaveDateConflicts('2026-08-10', '2026-08-10', rows, 'deep');
    expect(hit.hasConflict).toBe(false);
  });

  it('ignores rejected leave for same dates', () => {
    const rejected = [{ ...existingAug, id: 'lr-rej', status: 'Rejected' }];
    const hit = findLeaveDateConflicts('2026-08-10', '2026-08-10', rejected, 'biswajit');
    expect(hit.hasConflict).toBe(false);
  });

  it('ignores cancelled leave for same dates', () => {
    const cancelled = [{ ...existingAug, id: 'lr-can', status: 'Cancelled' }];
    const hit = findLeaveDateConflicts('2026-08-10', '2026-08-10', cancelled, 'biswajit');
    expect(hit.hasConflict).toBe(false);
  });

  it('blocks pending overlap', () => {
    const pending = [{ ...existingAug, status: 'Pending' }];
    expect(findLeaveDateConflicts('2026-08-10', '2026-08-10', pending, 'biswajit').hasConflict).toBe(true);
  });

  it('matches staff by display-name alias', () => {
    const aliased = [{ ...existingAug, userId: 'Biswajit Kumar' }];
    const aliasMap = new Map([['biswajit kumar', 'biswajit'], ['biswajit', 'biswajit']]);
    const hit = findLeaveDateConflicts('2026-08-10', '2026-08-10', aliased, 'biswajit', { aliasMap });
    expect(hit.hasConflict).toBe(true);
  });
});

describe('formatLeaveOverlapError', () => {
  it('formats advanced message with bullet dates', () => {
    const msg = formatLeaveOverlapError(['2026-08-10', '2026-08-11']);
    expect(msg).toContain('You already have a leave request for:');
    expect(msg).toContain(`• ${formatLeaveConflictDate('2026-08-10')}`);
    expect(msg).toContain(`• ${formatLeaveConflictDate('2026-08-11')}`);
  });

  it('uses generic message when dates missing', () => {
    expect(formatLeaveOverlapError([])).toMatch(/already exists for one or more selected dates/i);
  });
});
