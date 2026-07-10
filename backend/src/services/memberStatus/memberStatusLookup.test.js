import { describe, expect, it } from 'vitest';
import { normalizeMobile } from './memberStatusLookup.js';

describe('normalizeMobile', () => {
  it('strips non-digits', () => {
    expect(normalizeMobile('+91 98765-43210')).toBe('919876543210');
    expect(normalizeMobile('9876543210')).toBe('9876543210');
  });

  it('returns empty string for blank input', () => {
    expect(normalizeMobile('')).toBe('');
    expect(normalizeMobile(null)).toBe('');
  });
});
