import { describe, it, expect } from 'vitest';
import {
  deletePaymentQrSetting,
  extractUpiId,
  paymentQrRowToApp,
} from '../backend/src/services/paymentQr/paymentQrService.js';
import { isMissingDbTableError } from '../backend/src/db/supabase/utils.js';

describe('paymentQr', () => {
  it('paymentQrRowToApp maps branch label', () => {
    const row = {
      id: '11111111-1111-4111-8111-111111111111',
      gym_code_id: '22222222-2222-4222-8222-222222222222',
      qr_name: 'Gym Billing QR',
      qr_image_path: 'gyms/g1/payment-qr/b1/gym_billing_qr/v1.jpg',
      image_version: 1,
      display_order: 2,
      is_active: true,
      created_by: 'owner',
      created_at: '2026-06-14T00:00:00.000Z',
      updated_at: '2026-06-14T00:00:00.000Z',
    };
    const app = paymentQrRowToApp(row, { code: 'APA', name: 'Action Plus Adra' });
    expect(app.qrName).toBe('Gym Billing QR');
    expect(app.branchLabel).toBe('Action Plus Adra (APA)');
    expect(app.displayOrder).toBe(2);
    expect(app.isActive).toBe(true);
    expect(app.showInMemberPortal).toBe(false);
    expect(app.upiId).toBe('');
  });

  it('paymentQrRowToApp maps Member Portal flag and UPI ID', () => {
    const app = paymentQrRowToApp(
      {
        id: 'x',
        gym_code_id: 'y',
        qr_name: 'Google Pay',
        show_in_member_portal: true,
        upi_id: 'gymactionplus-@okicici',
      },
      { code: 'AP01', name: 'Adra' },
    );
    expect(app.showInMemberPortal).toBe(true);
    expect(app.upiId).toBe('gymactionplus-@okicici');
  });

  it('extractUpiId reads labeled QR names', () => {
    expect(extractUpiId('', 'Phone Pay UPI ID: 7047157510-3@axl')).toBe(
      '7047157510-3@axl',
    );
    expect(extractUpiId('direct@ybl', 'ignored')).toBe('direct@ybl');
  });

  it('paymentQrRowToApp handles inactive flag', () => {
    const app = paymentQrRowToApp(
      { id: 'x', gym_code_id: 'y', qr_name: 'PT QR', is_active: false },
      { code: 'APK', name: 'Kolkata' },
    );
    expect(app.isActive).toBe(false);
    expect(app.gymCode).toBe('APK');
  });

  it('isMissingDbTableError detects payment_qr_settings schema cache miss', () => {
    const err = {
      message: "Could not find the table 'public.payment_qr_settings' in the schema cache",
    };
    expect(isMissingDbTableError(err)).toBe(true);
  });

  it('deletePaymentQrSetting rejects non-owner auth without touching data', async () => {
    await expect(deletePaymentQrSetting({ role: 'staff' }, '11111111-1111-4111-8111-111111111111')).rejects.toMatchObject({
      message: 'payment-qr-manage-forbidden',
      status: 403,
    });
  });
});
