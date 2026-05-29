import { describe, expect, it } from 'vitest';
import {
  PASSWORD_RESET_STATUS,
  isPasswordResetPendingUser,
  passwordResetStatusFromRecord,
  canViewPasswordResetNotifications,
} from '../src/features/passwordReset/passwordResetStatus.js';
import {
  patchUserAfterPasswordResetReject,
  patchUserAfterPasswordResetApprove,
} from '../src/features/passwordReset/passwordResetUserPatch.js';

describe('passwordResetStatusFromRecord', () => {
  it('returns pending when requested without approval or rejection', () => {
    expect(passwordResetStatusFromRecord({
      passwordResetRequestedAt: '2026-05-01T10:00:00.000Z',
    })).toBe(PASSWORD_RESET_STATUS.PENDING);
  });

  it('returns approved when approved after request', () => {
    expect(passwordResetStatusFromRecord({
      passwordResetRequestedAt: '2026-05-01T10:00:00.000Z',
      passwordResetApprovedAt: '2026-05-01T11:00:00.000Z',
    })).toBe(PASSWORD_RESET_STATUS.APPROVED);
  });

  it('returns rejected when rejected after request', () => {
    expect(passwordResetStatusFromRecord({
      passwordResetRequestedAt: '2026-05-01T10:00:00.000Z',
      passwordResetRejectedAt: '2026-05-01T11:00:00.000Z',
    })).toBe(PASSWORD_RESET_STATUS.REJECTED);
  });

  it('returns rejected when only rejection timestamp remains', () => {
    expect(passwordResetStatusFromRecord({
      passwordResetRejectedAt: '2026-05-01T11:00:00.000Z',
    })).toBe(PASSWORD_RESET_STATUS.REJECTED);
  });

  it('returns pending for new request after rejection', () => {
    expect(passwordResetStatusFromRecord({
      passwordResetRequestedAt: '2026-05-02T10:00:00.000Z',
      passwordResetRejectedAt: '2026-05-01T11:00:00.000Z',
    })).toBe(PASSWORD_RESET_STATUS.PENDING);
  });
});

describe('isPasswordResetPendingUser', () => {
  it('is false for owner', () => {
    expect(isPasswordResetPendingUser({ id: 'owner', passwordResetStatus: 'pending' })).toBe(false);
  });

  it('is true for pending staff', () => {
    expect(isPasswordResetPendingUser({
      id: 'deep',
      passwordResetRequestedAt: '2026-05-01T10:00:00.000Z',
    })).toBe(true);
  });

  it('is false after reject patch', () => {
    const rejected = patchUserAfterPasswordResetReject({
      id: 'deep',
      passwordResetRequestedAt: '2026-05-01T10:00:00.000Z',
      passwordResetStatus: 'pending',
    });
    expect(isPasswordResetPendingUser(rejected)).toBe(false);
  });
});

describe('patchUserAfterPasswordResetReject', () => {
  it('clears pending fields and keeps password fields untouched', () => {
    const user = {
      id: 'birjeet',
      name: 'Birjeet',
      password: 'secret',
      passwordResetRequestedAt: '2026-05-01T10:00:00.000Z',
      passwordResetStatus: 'pending',
    };
    const next = patchUserAfterPasswordResetReject(user, { actor: 'owner', now: '2026-05-01T12:00:00.000Z' });
    expect(next.password).toBe('secret');
    expect(next.passwordResetRequestedAt).toBe('');
    expect(next.passwordResetStatus).toBe(PASSWORD_RESET_STATUS.REJECTED);
    expect(next.passwordResetRejectedBy).toBe('owner');
  });
});

describe('canViewPasswordResetNotifications', () => {
  it('allows master owner login id', () => {
    expect(canViewPasswordResetNotifications({ id: 'owner' })).toBe(true);
  });

  it('allows branch_owner role', () => {
    expect(canViewPasswordResetNotifications({ id: 'mgr', staffRole: 'branch_owner' })).toBe(true);
  });

  it('denies regular staff', () => {
    expect(canViewPasswordResetNotifications({ id: 'deep', staffRole: 'staff' })).toBe(false);
  });
});
