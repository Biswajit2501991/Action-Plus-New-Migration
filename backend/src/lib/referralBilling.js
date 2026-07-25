/** Referral billing constants (1A + 2A). Single source of truth. */

export const REFERRER_CREDIT_INR = 50;
export const NEW_MEMBER_JOIN_DISCOUNT_INR = 100;

export const PORTAL_ALLOWED_MEMBERSHIP_STATUSES = new Set(["active", "hold"]);

export function normalizeReferralCode(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

export function isAllowedReferrerStatus(status) {
  return PORTAL_ALLOWED_MEMBERSHIP_STATUSES.has(
    String(status || "").trim().toLowerCase(),
  );
}

export function joinCollectAmount(planAmountInr, hasValidReferral) {
  const plan = Math.max(0, Number(planAmountInr) || 0);
  if (!hasValidReferral) return plan;
  return Math.max(0, plan - NEW_MEMBER_JOIN_DISCOUNT_INR);
}
