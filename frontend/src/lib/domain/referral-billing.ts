/** Shared referral billing constants (must match backend). */

export const REFERRER_CREDIT_INR = 50;
export const NEW_MEMBER_JOIN_DISCOUNT_INR = 100;

export function joinCollectAmount(
  planAmountInr: number | string | undefined,
  hasValidReferral: boolean,
): number {
  const plan = Math.max(0, Number(planAmountInr) || 0);
  if (!hasValidReferral) return plan;
  return Math.max(0, plan - NEW_MEMBER_JOIN_DISCOUNT_INR);
}

export function paymentAmountWithReferralCredit(
  planAmountInr: number | string | undefined,
  pendingCreditInr: number,
): number {
  const plan = Math.max(0, Number(planAmountInr) || 0);
  const credit = Math.max(0, Number(pendingCreditInr) || 0);
  if (credit <= 0) return plan;
  return Math.max(1, plan - credit);
}
