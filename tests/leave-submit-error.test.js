import { describe, expect, it } from 'vitest';
import { leaveSubmitErrorMessage } from '../src/features/leave/leaveSubmitError.js';

describe('leaveSubmitErrorMessage', () => {
  it('maps 409 leave-overlap to a clear staff message', () => {
    expect(
      leaveSubmitErrorMessage({ status: 409, apiError: 'leave-overlap', message: 'overlap' }),
    ).toBe('You already applied leave for these dates.');
  });

  it('falls back for unknown errors', () => {
    expect(leaveSubmitErrorMessage({ status: 500 })).toMatch(/try again/i);
  });
});
