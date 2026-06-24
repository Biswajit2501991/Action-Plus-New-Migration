import { describe, expect, it } from 'vitest';
import {
  ATTENDANCE_NOTES_FEATURE_FLAG_KEY,
  ATTENDANCE_NOTE_CATEGORIES,
  isAttendanceNotesEnabled,
} from '../src/features/attendance/attendanceNotesFeature.js';
import {
  sanitizeAttendanceNoteText,
  validateAttendanceNotePayload,
  formatAttendanceNoteBadge,
} from '../src/features/attendance/attendanceNotesValidation.js';
import {
  isLoginLateForShift,
  resolveBranchShiftConfig,
} from '../src/features/attendance/attendanceLateDetection.js';

describe('attendanceNotesFeature', () => {
  it('uses attendanceNotesEnabled flag key', () => {
    expect(ATTENDANCE_NOTES_FEATURE_FLAG_KEY).toBe('attendanceNotesEnabled');
  });

  it('defaults feature off unless explicitly true', () => {
    expect(isAttendanceNotesEnabled({})).toBe(false);
    expect(isAttendanceNotesEnabled({ attendanceNotesEnabled: true })).toBe(true);
    expect(isAttendanceNotesEnabled({ attendanceNotesEnabled: 'true' })).toBe(false);
  });
});

describe('canSubmitOwnLateNote', () => {
  it('defaults on unless explicitly false', async () => {
    const { canSubmitOwnLateNote } = await import('../src/features/access/permissions.js');
    expect(canSubmitOwnLateNote({})).toBe(true);
    expect(canSubmitOwnLateNote({ attendance: { submitOwnLateNote: false } })).toBe(false);
    expect(canSubmitOwnLateNote({ attendance: { viewAttendance: false, submitOwnLateNote: true } })).toBe(true);
  });
});

describe('attendanceNotesFeature categories', () => {
  it('defines expected categories', () => {
    expect(ATTENDANCE_NOTE_CATEGORIES).toContain('traffic');
    expect(ATTENDANCE_NOTE_CATEGORIES).toContain('optional');
  });
});

describe('attendanceNotesService branch scope', () => {
  it('returns null branch ids for master owner global view', async () => {
    const { resolveAttendanceNotesBranchIds } = await import('../backend/src/services/attendance/attendanceNotesService.js');
    expect(resolveAttendanceNotesBranchIds({ userId: 'owner', staffRole: 'master_owner' })).toBe(null);
    expect(resolveAttendanceNotesBranchIds({
      userId: 'owner',
      staffRole: 'master_owner',
      activeBranchId: 'branch-1',
      gymCodeId: 'branch-1',
    })).toEqual(['branch-1']);
  });
});

describe('attendanceNotesValidation', () => {
  it('sanitizes and validates note payload', () => {
    const out = validateAttendanceNotePayload({ noteCategory: 'rain', note: '  Heavy rain  ' });
    expect(out.noteCategory).toBe('rain');
    expect(out.note).toBe('Heavy rain');
  });

  it('rejects invalid category', () => {
    expect(() => validateAttendanceNotePayload({ noteCategory: 'invalid', note: 'x' })).toThrow('invalid-note-category');
  });

  it('formats late badge labels', () => {
    expect(formatAttendanceNoteBadge({ noteCategory: 'traffic', note: 'Jam' })).toBe('Late — Traffic');
    expect(formatAttendanceNoteBadge({ noteCategory: 'optional', note: 'Worked from home first' })).toContain('Worked');
  });

  it('strips control characters', () => {
    expect(sanitizeAttendanceNoteText('ok\u0000note')).toBe('oknote');
  });
});

describe('attendanceLateDetection', () => {
  const gymCodes = [{ id: 'b1', shiftStartTime: '09:30', shiftTimezone: 'IST' }];

  it('resolves branch shift config', () => {
    expect(resolveBranchShiftConfig(gymCodes, 'b1').shiftStartTime).toBe('09:30');
    expect(resolveBranchShiftConfig(gymCodes, 'missing').shiftStartTime).toBeNull();
  });

  it('detects login after shift start', () => {
    const late = new Date(2026, 5, 15, 10, 0, 0);
    const onTime = new Date(2026, 5, 15, 9, 0, 0);
    expect(isLoginLateForShift(late.toISOString(), '09:30')).toBe(true);
    expect(isLoginLateForShift(onTime.toISOString(), '09:30')).toBe(false);
    expect(isLoginLateForShift(late.toISOString(), null)).toBe(false);
  });
});
