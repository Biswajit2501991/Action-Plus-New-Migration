import { describe, expect, it } from 'vitest';
import { isLoopbackRequest } from './isLoopbackRequest.js';

describe('isLoopbackRequest', () => {
  it('accepts IPv4 and IPv6 loopback addresses', () => {
    expect(isLoopbackRequest({ socket: { remoteAddress: '127.0.0.1' } })).toBe(true);
    expect(isLoopbackRequest({ socket: { remoteAddress: '::1' } })).toBe(true);
    expect(isLoopbackRequest({ socket: { remoteAddress: '::ffff:127.0.0.1' } })).toBe(true);
  });

  it('rejects remote peers', () => {
    expect(isLoopbackRequest({ socket: { remoteAddress: '203.0.113.10' } })).toBe(false);
  });
});
