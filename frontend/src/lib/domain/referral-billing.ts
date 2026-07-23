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

/**
 * Reminder SMS [Amount] text.
 * With credit: "699- 50(referral credit) = 649/-"
 * Without: "699"
 */
export function formatReminderAmountWithReferralCredit(
  planAmountInr: number | string | undefined,
  pendingCreditInr: number | string | undefined,
): string {
  const plan = Math.max(0, Number(planAmountInr) || 0);
  const credit = Math.max(0, Number(pendingCreditInr) || 0);
  if (credit <= 0) return `${plan}`;
  const net = paymentAmountWithReferralCredit(plan, credit);
  return `${plan}- ${credit}(referral credit) = ${net}/-`;
}

/** Templates that should surface pending referral credit in [Amount]. */
export function templateUsesReferralCreditInAmount(templateKey?: string | null): boolean {
  const key = String(templateKey || "").trim();
  return key === "reminder" || key === "monthReminder";
}
