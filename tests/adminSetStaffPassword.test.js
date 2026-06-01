import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PASSWORD_RESET_STATUS } from '../src/features/passwordReset/passwordResetStatus.js';

const mocks = vi.hoisted(() => ({
  findStaffByIdentifier: vi.fn(),
  getStaffAppUser: vi.fn(),
  setStaffPassword: vi.fn(),
  updateStaffUserRow: vi.fn(),
  logPasswordResetAudit: vi.fn(),
  assertActorCanDecideForStaff: vi.fn(),
  isPasswordResetPendingRow: vi.fn(),
  validatePendingDecision: vi.fn(),
}));

vi.mock('../backend/src/auth/staffAuth.js', () => ({
  findStaffByIdentifier: mocks.findStaffByIdentifier,
  getStaffAppUser: mocks.getStaffAppUser,
  setStaffPassword: mocks.setStaffPassword,
}));

vi.mock('../backend/src/db/supabase/staffUsersWrite.js', () => ({
  updateStaffUserRow: mocks.updateStaffUserRow,
}));

vi.mock('../backend/src/db/supabase/client.js', () => ({
  getSupabase: () => ({}),
}));

vi.mock('../backend/src/auth/passwordReset/passwordResetAuditService.js', () => ({
  logPasswordResetAudit: mocks.logPasswordResetAudit,
}));

vi.mock('../backend/src/auth/passwordReset/passwordResetDecisionEngine.js', () => ({
  assertActorCanDecideForStaff: mocks.assertActorCanDecideForStaff,
  isPasswordResetPendingRow: mocks.isPasswordResetPendingRow,
  validatePendingDecision: mocks.validatePendingDecision,
}));

const {
  adminSetStaffPassword,
  approveStaffPasswordReset,
} = await import('../backend/src/auth/passwordReset/passwordResetRequestService.js');

describe('adminSetStaffPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findStaffByIdentifier.mockResolvedValue({
      id: 'pk-1',
      staff_login_id: 'Raja',
      password_reset_requested_at: null,
    });
    mocks.getStaffAppUser.mockResolvedValue({ id: 'Raja', name: 'Raja', gymCodeId: 'b1' });
    mocks.setStaffPassword.mockResolvedValue(true);
    mocks.updateStaffUserRow.mockResolvedValue(undefined);
    mocks.logPasswordResetAudit.mockResolvedValue(undefined);
    mocks.isPasswordResetPendingRow.mockReturnValue(false);
  });

  it('sets password without requiring a pending reset request', async () => {
    const auth = { userId: 'owner' };
    const result = await adminSetStaffPassword(auth, 'Raja', 'newpass1234');

    expect(mocks.assertActorCanDecideForStaff).toHaveBeenCalledWith(auth, { id: 'Raja', name: 'Raja', gymCodeId: 'b1' });
    expect(mocks.setStaffPassword).toHaveBeenCalledWith('Raja', 'newpass1234', { clearPasswordReset: true });
    expect(mocks.validatePendingDecision).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, staffId: 'Raja', status: 'set' });
    expect(mocks.logPasswordResetAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'staff.password_set.admin',
      staffId: 'Raja',
    }));
  });

  it('logs password_reset.approved when a pending reset exists', async () => {
    mocks.isPasswordResetPendingRow.mockReturnValue(true);
    const result = await adminSetStaffPassword({ userId: 'owner' }, 'Raja', 'newpass1234');
    expect(result.status).toBe(PASSWORD_RESET_STATUS.APPROVED);
    expect(mocks.logPasswordResetAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'staff.password_reset.approved',
    }));
  });
});

describe('approveStaffPasswordReset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findStaffByIdentifier.mockResolvedValue({
      id: 'pk-1',
      staff_login_id: 'Raja',
      password_reset_requested_at: '2026-05-01T10:00:00.000Z',
    });
    mocks.getStaffAppUser.mockResolvedValue({ id: 'Raja', name: 'Raja', gymCodeId: 'b1' });
    mocks.setStaffPassword.mockResolvedValue(true);
    mocks.updateStaffUserRow.mockResolvedValue(undefined);
    mocks.logPasswordResetAudit.mockResolvedValue(undefined);
    mocks.isPasswordResetPendingRow.mockReturnValue(true);
  });

  it('still rejects when reset is not pending', async () => {
    mocks.validatePendingDecision.mockReturnValue({ ok: false, error: 'reset-not-pending' });
    await expect(approveStaffPasswordReset({ userId: 'owner' }, 'Raja', 'pw1234')).rejects.toMatchObject({
      message: 'reset-not-pending',
      status: 409,
    });
    expect(mocks.setStaffPassword).not.toHaveBeenCalled();
  });

  it('sets password when reset is pending', async () => {
    mocks.validatePendingDecision.mockReturnValue({ ok: true, status: PASSWORD_RESET_STATUS.PENDING });
    const result = await approveStaffPasswordReset({ userId: 'owner' }, 'Raja', 'pw1234');
    expect(mocks.setStaffPassword).toHaveBeenCalled();
    expect(result.status).toBe(PASSWORD_RESET_STATUS.APPROVED);
  });
});
