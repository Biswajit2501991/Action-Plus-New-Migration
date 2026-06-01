import { describe, expect, it, vi } from 'vitest';
import { appStaffToRow } from '../backend/src/db/supabase/mappers.js';
import {
  isPasswordResetRejectionColumnError,
  omitPasswordResetRejectionColumns,
  updateStaffUserRow,
} from '../backend/src/db/supabase/staffUsersWrite.js';

describe('appStaffToRow password reset rejection columns', () => {
  it('does not include rejection columns in bulk staff sync rows', () => {
    const row = appStaffToRow({
      id: 'Raja',
      name: 'Raja',
      passwordResetRejectedAt: '2026-05-01T00:00:00.000Z',
      passwordResetRejectedBy: 'owner',
    }, 'gym-1');
    expect(row).not.toHaveProperty('password_reset_rejected_at');
    expect(row).not.toHaveProperty('password_reset_rejected_by');
    expect(row.staff_login_id).toBe('Raja');
  });
});

describe('staffUsersWrite helpers', () => {
  it('detects rejection column schema errors', () => {
    expect(isPasswordResetRejectionColumnError(new Error("Could not find the 'password_reset_rejected_at' column"))).toBe(true);
    expect(isPasswordResetRejectionColumnError(new Error('other'))).toBe(false);
  });

  it('omitPasswordResetRejectionColumns strips rejection fields', () => {
    expect(omitPasswordResetRejectionColumns({
      full_name: 'Raja',
      password_reset_rejected_at: null,
      password_reset_rejected_by: null,
    })).toEqual({ full_name: 'Raja' });
  });

  it('updateStaffUserRow retries without rejection columns', async () => {
    let call = 0;
    const eq = vi.fn(() => {
      call += 1;
      if (call === 1) {
        return Promise.resolve({ error: { message: "Could not find the 'password_reset_rejected_at' column" } });
      }
      return Promise.resolve({ error: null });
    });
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    const sb = { from };

    await updateStaffUserRow(sb, 'pk-1', {
      full_name: 'Raja',
      password_reset_rejected_at: null,
      password_reset_rejected_by: null,
    });

    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[1][0]).toEqual({ full_name: 'Raja' });
  });
});
