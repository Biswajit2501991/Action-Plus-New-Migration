import { describe, expect, it } from 'vitest';
import { leaveDateRangesOverlap, leaveRowToApp } from './leaveRequestsWrite.js';

describe('leaveDateRangesOverlap', () => {
  it('detects overlapping inclusive ranges', () => {
    expect(leaveDateRangesOverlap('2026-05-21', '2026-05-21', '2026-05-21', '2026-05-25')).toBe(true);
    expect(leaveDateRangesOverlap('2026-05-01', '2026-05-10', '2026-05-11', '2026-05-20')).toBe(false);
  });

  it('detects partial overlap', () => {
    expect(leaveDateRangesOverlap('2026-05-01', '2026-05-15', '2026-05-10', '2026-05-20')).toBe(true);
  });
});

describe('leaveRowToApp', () => {
  it('includes computed days from date range', () => {
    const row = leaveRowToApp({
      external_request_id: 'lr-1',
      staff_login_id: 'deep',
      leave_type: 'Casual',
      start_date: '2026-06-01',
      end_date: '2026-06-03',
      reason: 'trip',
      status: 'Approved',
      approved_by: 'owner',
      created_at: '2026-05-01T00:00:00.000Z',
    });
    expect(row.days).toBe(3);
    expect(row.isHalfDay).toBe(false);
    expect(row.userId).toBe('deep');
  });

  it('counts a flagged single date as half a day', () => {
    const row = leaveRowToApp({
      external_request_id: 'lr-half',
      staff_login_id: 'deep',
      leave_type: 'Casual',
      start_date: '2026-06-01',
      end_date: '2026-06-01',
      is_half_day: true,
      status: 'Approved',
    });
    expect(row.days).toBe(0.5);
    expect(row.isHalfDay).toBe(true);
  });

  it('keeps a multi-day request as full days even if the flag is set', () => {
    const row = leaveRowToApp({
      external_request_id: 'lr-range',
      staff_login_id: 'deep',
      start_date: '2026-06-01',
      end_date: '2026-06-02',
      is_half_day: true,
      status: 'Approved',
    });
    expect(row.days).toBe(2);
    expect(row.isHalfDay).toBe(false);
  });

  it('keeps an old row without the flag as a full day', () => {
    const row = leaveRowToApp({
      external_request_id: 'lr-old',
      staff_login_id: 'deep',
      start_date: '2026-06-01',
      end_date: '2026-06-01',
      status: 'Approved',
    });
    expect(row.days).toBe(1);
    expect(row.isHalfDay).toBe(false);
  });
});
