/** Gym-wide flag in settings_app_config.config_json — default off. */
export const PAYMENT_QR_REMINDER_FLAG_KEY = 'paymentQrInReminderEnabled';

/**
 * @param {Record<string, unknown>|null|undefined} settings
 * @returns {boolean}
 */
export function isPaymentQrInReminderEnabled(settings) {
  return settings?.[PAYMENT_QR_REMINDER_FLAG_KEY] === true;
}

/**
 * Resolve gym code for payment link from member branch (HQ fallback when unassigned).
 * @param {object} member
 * @param {Array<{ id: string, code?: string }>} gymCodes
 * @param {string} [hqGymCodeId]
 */
export function resolveMemberBranchCodeForPaymentQr(member, gymCodes = [], hqGymCodeId = '') {
  let branchId = String(member?.assignedGymCodeId || '').trim();
  if (!branchId) branchId = String(hqGymCodeId || '').trim();
  if (!branchId) return '';
  const hit = (Array.isArray(gymCodes) ? gymCodes : []).find(
    (gc) => String(gc?.id || '').trim() === branchId,
  );
  return String(hit?.code || '').trim().toUpperCase();
}

/**
 * @param {string} gymCode
 * @param {string} apiBaseUrl e.g. /api or https://host/api
 */
export function buildPublicPaymentQrViewUrl(gymCode, apiBaseUrl) {
  const code = String(gymCode || '').trim().toUpperCase();
  if (!code) return '';
  const base = String(apiBaseUrl || '').replace(/\/+$/, '');
  if (!base) return '';
  return `${base}/public/payment-qr/${encodeURIComponent(code)}/view`;
}

/**
 * Append branch payment page link to reminder message (compose-time only).
 */
export function appendPaymentQrLinkToReminderMessage(message, { enabled = false, gymCode = '', apiBaseUrl = '' } = {}) {
  if (!enabled) return String(message || '');
  const url = buildPublicPaymentQrViewUrl(gymCode, apiBaseUrl);
  if (!url) return String(message || '');
  const base = String(message || '').trimEnd();
  const append = `\n\nClick below to pay:\n${url}`;
  return base ? `${base}${append}` : append.trim();
}

/**
 * Apply payment QR link only for billing reminder template key.
 */
export function maybeAppendPaymentQrToReminderMessage(message, {
  templateKey = '',
  member = null,
  settings = null,
  gymCodes = [],
  hqGymCodeId = '',
  apiBaseUrl = '',
} = {}) {
  if (String(templateKey || '').trim() !== 'reminder') return String(message || '');
  if (!isPaymentQrInReminderEnabled(settings)) return String(message || '');
  const gymCode = resolveMemberBranchCodeForPaymentQr(member, gymCodes, hqGymCodeId);
  if (!gymCode) return String(message || '');
  return appendPaymentQrLinkToReminderMessage(message, {
    enabled: true,
    gymCode,
    apiBaseUrl,
  });
}
