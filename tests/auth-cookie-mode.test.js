import { describe, expect, it } from 'vitest';
import { parseAuthCookieMode } from '../src/shared/authCookieMode.js';

describe('authCookieMode', () => {
  it('parses common truthy values', () => {
    expect(parseAuthCookieMode('1')).toBe(true);
    expect(parseAuthCookieMode('true')).toBe(true);
    expect(parseAuthCookieMode(true)).toBe(true);
  });

  it('defaults to false when unset', () => {
    expect(parseAuthCookieMode(undefined)).toBe(false);
    expect(parseAuthCookieMode('0')).toBe(false);
    expect(parseAuthCookieMode('false')).toBe(false);
  });
});
