import { describe, it, expect } from 'vitest';
import {
  attendanceCalendarDateKey,
  attendanceTodayCalendarKey,
  resolveAttendanceTimeZone,
} from '../backend/src/services/attendance/attendanceCalendarDate.js';

describe('attendanceCalendarDateKey', () => {
  it('maps IST alias to Asia/Kolkata', () => {
    expect(resolveAttendanceTimeZone('IST')).toBe('Asia/Kolkata');
    expect(resolveAttendanceTimeZone('')).toBe('Asia/Kolkata');
  });

  it('keeps early-morning IST punches on the IST calendar day (not UTC)', () => {
    // 2026-07-29 05:00 IST = 2026-07-28T23:30:00.000Z
    const at = '2026-07-28T23:30:00.000Z';
    expect(at.slice(0, 10)).toBe('2026-07-28'); // UTC trap
    expect(attendanceCalendarDateKey(at, 'IST')).toBe('2026-07-29');
    expect(attendanceCalendarDateKey(at, 'Asia/Kolkata')).toBe('2026-07-29');
  });

  it('keeps late-evening IST punches on the IST calendar day', () => {
    // 2026-07-29 23:00 IST = 2026-07-29T17:30:00.000Z
    const at = '2026-07-29T17:30:00.000Z';
    expect(attendanceCalendarDateKey(at, 'IST')).toBe('2026-07-29');
  });

  it('rolls overnight IST logout onto the next IST day', () => {
    // 2026-07-30 01:00 IST = 2026-07-29T19:30:00.000Z
    const at = '2026-07-29T19:30:00.000Z';
    expect(at.slice(0, 10)).toBe('2026-07-29'); // UTC trap
    expect(attendanceCalendarDateKey(at, 'Asia/Kolkata')).toBe('2026-07-30');
  });

  it('attendanceTodayCalendarKey uses IST', () => {
    const fixed = new Date('2026-07-28T23:30:00.000Z');
    expect(attendanceTodayCalendarKey('IST', fixed)).toBe('2026-07-29');
  });
});
