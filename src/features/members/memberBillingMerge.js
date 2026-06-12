import { mergeMemberPhotoFields } from './memberAvatarResolver.js';

function parseApgTimeMs(value) {
  const s = String(value || '').trim();
  if (!s) return 0;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Billing cycle fields must not follow generic updatedAt (payments, SMS, etc. bump updatedAt).
 * Whichever side has the newer billingDateUpdatedAt wins billingDate / nextPaymentDate / paymentBy.
 */
export function pickMemberBillingSource(localRow, remoteRow, mergedFallback) {
  const lf = parseApgTimeMs(localRow?.billingDateUpdatedAt);
  const rf = parseApgTimeMs(remoteRow?.billingDateUpdatedAt);
  if (lf <= 0 && rf <= 0) return mergedFallback;
  if (lf >= rf) return localRow;
  return remoteRow;
}

/** Merge PATCH /members/:id response without clobbering billing cycle or photo fields. */
export function mergeMemberPatchResponse(localRow, serverRow) {
  if (!localRow) return serverRow || localRow;
  if (!serverRow) return localRow;
  const billingSrc = pickMemberBillingSource(localRow, serverRow, serverRow);
  const photoMeta = mergeMemberPhotoFields(localRow, serverRow);
  return {
    ...localRow,
    ...serverRow,
    ...photoMeta,
    billingDate: billingSrc.billingDate,
    nextPaymentDate: billingSrc.nextPaymentDate,
    paymentBy: billingSrc.paymentBy,
    billingDateUpdatedAt: billingSrc.billingDateUpdatedAt || serverRow.billingDateUpdatedAt || localRow.billingDateUpdatedAt,
  };
}
