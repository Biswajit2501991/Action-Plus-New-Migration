import { describe, expect, it } from 'vitest';
import {
  isPasswordResetPendingRow,
  validatePendingDecision,
} from '../backend/src/auth/passwordReset/passwordResetDecisionEngine.js';
import { PASSWORD_RESET_STATUS } from '../src/features/passwordReset/passwordResetStatus.js';

describe('passwordResetDecisionEngine', () => {
  it('detects pending row', () => {
    expect(isPasswordResetPendingRow({
      password_reset_requested_at: '2026-05-01T10:00:00.000Z',
    })).toBe(true);
  });

  it('allows decision on pending row', () => {
    const gate = validatePendingDecision({
      password_reset_requested_at: '2026-05-01T10:00:00.000Z',
    }, PASSWORD_RESET_STATUS.REJECTED);
    expect(gate.ok).toBe(true);
    expect(gate.status).toBe(PASSWORD_RESET_STATUS.PENDING);
  });

  it('returns alreadyProcessed for repeated reject', () => {
    const gate = validatePendingDecision({
      password_reset_rejected_at: '2026-05-01T11:00:00.000Z',
    }, PASSWORD_RESET_STATUS.REJECTED);
    expect(gate.ok).toBe(true);
    expect(gate.alreadyProcessed).toBe(true);
  });

  it('blocks approve when already rejected', () => {
    const gate = validatePendingDecision({
      password_reset_rejected_at: '2026-05-01T11:00:00.000Z',
    }, PASSWORD_RESET_STATUS.APPROVED);
    expect(gate.ok).toBe(false);
    expect(gate.error).toBe('reset-not-pending');
  });
});
