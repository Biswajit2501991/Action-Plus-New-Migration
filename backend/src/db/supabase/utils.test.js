import { describe, expect, it } from 'vitest';
import { isMissingDbTableError } from './utils.js';

describe('isMissingDbTableError', () => {
  it('detects PostgREST schema cache missing table', () => {
    const err = {
      message: "Could not find the table 'public.member_paid_for_month' in the schema cache",
    };
    expect(isMissingDbTableError(err)).toBe(true);
  });

  it('detects classic relation missing errors', () => {
    expect(isMissingDbTableError({ message: 'relation "foo" does not exist' })).toBe(true);
  });

  it('does not treat generic errors as missing table', () => {
    expect(isMissingDbTableError({ message: 'permission denied' })).toBe(false);
  });
});
