import { readJsonValue } from '../db/dataStore.js';

async function readSettingsFlags() {
  const settings = (await readJsonValue('apg.settings', {}, null)) || {};
  const legacyMaster = settings.qrVisitorAttendanceEnabled === true;
  return {
    settings,
    visitorEnabled: settings.qrVisitorIntakeEnabled === true || legacyMaster,
    attendanceQrEnabled: settings.attendanceRequirePresenceQr === true,
  };
}

export async function isQrVisitorIntakeFeatureEnabled() {
  const { visitorEnabled } = await readSettingsFlags();
  return visitorEnabled;
}

export async function isAttendancePresenceQrFeatureEnabled() {
  const { attendanceQrEnabled } = await readSettingsFlags();
  return attendanceQrEnabled;
}

/** @deprecated Use visitor / attendance helpers. */
export async function isQrVisitorAttendanceFeatureEnabled() {
  const { visitorEnabled, attendanceQrEnabled } = await readSettingsFlags();
  return visitorEnabled || attendanceQrEnabled;
}

export function qrVisitorFeatureDisabledError() {
  const err = new Error('feature-disabled');
  err.status = 403;
  err.code = 'feature-disabled';
  err.detail =
    'QR Visitor intake is turned off. Ask the owner to enable it in Settings.';
  return err;
}

export function qrAttendanceFeatureDisabledError() {
  const err = new Error('feature-disabled');
  err.status = 403;
  err.code = 'feature-disabled';
  err.detail =
    'Staff Attendance QR is turned off. Ask the owner to enable “Require attendance QR for Time In” in Settings.';
  return err;
}

/** @deprecated */
export function qrFeatureDisabledError() {
  return qrVisitorFeatureDisabledError();
}
