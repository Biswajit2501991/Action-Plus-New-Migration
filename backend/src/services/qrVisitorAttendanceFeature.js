import { readJsonValue } from '../../db/dataStore.js';

export async function isQrVisitorAttendanceFeatureEnabled() {
  const settings = (await readJsonValue('apg.settings', {}, null)) || {};
  return settings.qrVisitorAttendanceEnabled === true;
}

export function qrFeatureDisabledError() {
  const err = new Error('feature-disabled');
  err.status = 403;
  err.code = 'feature-disabled';
  err.detail =
    'QR Visitor & Attendance is turned off. Ask the owner to enable it in Settings.';
  return err;
}
