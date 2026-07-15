import { describe, expect, it } from 'vitest';
import {
  rotateAttendancePresenceToken,
  redeemAttendancePresenceToken,
  consumeAttendancePresenceTicket,
} from '../backend/src/services/attendance/presenceTokens.js';

describe('attendance presence tokens', () => {
  it('rotate → redeem → consume allows one login punch', () => {
    const branchId = `branch-${Date.now()}`;
    const rotated = rotateAttendancePresenceToken(branchId);
    expect(rotated.token).toBeTruthy();
    expect(rotated.gymCodeId).toBe(branchId);

    const redeemed = redeemAttendancePresenceToken(rotated.token);
    expect(redeemed.presenceTicket).toBeTruthy();
    expect(redeemed.gymCodeId).toBe(branchId);

    const consumed = consumeAttendancePresenceTicket(redeemed.presenceTicket, 'staff-1');
    expect(consumed.gymCodeId).toBe(branchId);

    expect(() =>
      consumeAttendancePresenceTicket(redeemed.presenceTicket, 'staff-1'),
    ).toThrow(/presence_required/);
  });

  it('rejects expired or unknown display tokens', () => {
    expect(() => redeemAttendancePresenceToken('not-a-real-token')).toThrow(/token-invalid/);
  });

  it('rejects punch without a ticket', () => {
    expect(() => consumeAttendancePresenceTicket('', 'staff-1')).toThrow(/presence_required/);
  });

  it('keeps the previous display token valid until its own TTL (overlap)', () => {
    const branchId = `branch-overlap-${Date.now()}`;
    const first = rotateAttendancePresenceToken(branchId);
    const second = rotateAttendancePresenceToken(branchId);
    expect(redeemAttendancePresenceToken(first.token).presenceTicket).toBeTruthy();
    expect(redeemAttendancePresenceToken(second.token).presenceTicket).toBeTruthy();
  });
});
