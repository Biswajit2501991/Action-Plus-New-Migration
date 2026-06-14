import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentQrRowToApp } from '../backend/src/services/paymentQr/paymentQrService.js';
import { isMissingDbTableError } from '../backend/src/db/supabase/utils.js';

test('paymentQrRowToApp maps branch label', () => {
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
  assert.equal(app.qrName, 'Gym Billing QR');
  assert.equal(app.branchLabel, 'Action Plus Adra (APA)');
  assert.equal(app.displayOrder, 2);
  assert.equal(app.isActive, true);
});

test('paymentQrRowToApp handles inactive flag', () => {
  const app = paymentQrRowToApp({ id: 'x', gym_code_id: 'y', qr_name: 'PT QR', is_active: false }, { code: 'APK', name: 'Kolkata' });
  assert.equal(app.isActive, false);
  assert.equal(app.gymCode, 'APK');
});

test('isMissingDbTableError detects payment_qr_settings schema cache miss', () => {
  const err = {
    message: "Could not find the table 'public.payment_qr_settings' in the schema cache",
  };
  assert.equal(isMissingDbTableError(err), true);
});
