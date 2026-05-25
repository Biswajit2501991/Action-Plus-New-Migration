import { describe, expect, it } from 'vitest';
import { leaveDateRangesOverlap } from './leaveRequestsWrite.js';

describe('leaveDateRangesOverlap', () => {
  it('detects overlapping inclusive ranges', () => {
    expect(leaveDateRangesOverlap('2026-05-21', '2026-05-21', '2026-05-21', '2026-05-25')).toBe(true);
    expect(leaveDateRangesOverlap('2026-05-01', '2026-05-10', '2026-05-11', '2026-05-20')).toBe(false);
  });

  it('detects partial overlap', () => {
    expect(leaveDateRangesOverlap('2026-05-01', '2026-05-15', '2026-05-10', '2026-05-20')).toBe(true);
  });
});
