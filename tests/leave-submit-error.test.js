import { describe, expect, it } from 'vitest';
import { leaveSubmitErrorMessage } from '../src/features/leave/leaveSubmitError.js';

describe('leaveSubmitErrorMessage', () => {
  it('maps 409 leave-overlap with conflict dates', () => {
    const msg = leaveSubmitErrorMessage({
      status: 409,
      apiError: 'leave-overlap',
      conflictDates: ['2026-08-10', '2026-08-11'],
    });
    expect(msg).toContain('You already have a leave request for:');
    expect(msg).toContain('10-Aug-2026');
    expect(msg).toContain('11-Aug-2026');
  });

  it('falls back for unknown errors', () => {
    expect(leaveSubmitErrorMessage({ status: 500 })).toMatch(/try again/i);
  });
});
