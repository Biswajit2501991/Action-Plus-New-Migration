import { describe, expect, it } from 'vitest';
import { isRecordNewWithinHours, NEW_RECORD_BADGE_HOURS } from '../../src/lib/isRecordNewWithinHours.js';

describe('isRecordNewWithinHours', () => {
  const now = Date.parse('2026-06-15T12:00:00.000Z');

  it('returns true within 48 hours', () => {
    const created = '2026-06-14T13:00:00.000Z';
    expect(isRecordNewWithinHours(created, NEW_RECORD_BADGE_HOURS, now)).toBe(true);
  });

  it('returns false at exactly 48 hours', () => {
    const created = '2026-06-13T12:00:00.000Z';
    expect(isRecordNewWithinHours(created, NEW_RECORD_BADGE_HOURS, now)).toBe(false);
  });

  it('returns false for missing timestamp', () => {
    expect(isRecordNewWithinHours('', NEW_RECORD_BADGE_HOURS, now)).toBe(false);
    expect(isRecordNewWithinHours(null, NEW_RECORD_BADGE_HOURS, now)).toBe(false);
  });
});
