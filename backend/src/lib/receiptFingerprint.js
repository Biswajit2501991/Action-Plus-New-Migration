import { createHmac } from "crypto";
import { env } from "../config/env.js";

/** Same secret chain as Gym Website receipt fingerprints / member QR. */
export function memberPortalSecret() {
  return String(
    process.env.MEMBER_PORTAL_JWT_SECRET ||
      process.env.ADMIN_SESSION_SECRET ||
      env.JWT_SECRET ||
      "",
  ).trim();
}

/**
 * Deterministic receipt fingerprint — must match Gym Website
 * `receiptFingerprint` in lib/member-portal/receipt-share.ts
 */
export function receiptFingerprint({ gymId, memberId, paymentId }) {
  const digest = createHmac("sha256", memberPortalSecret())
    .update(
      `receipt-fp:v1:${String(gymId)}:${Number(memberId)}:${String(paymentId)}`,
    )
    .digest("hex")
    .toUpperCase();
  return `APG-${digest.slice(0, 4)}-${digest.slice(4, 8)}`;
}

/** Public payment id used on portal receipts (external id, else row id). */
export function paymentPublicId(row) {
  const ext = String(row?.external_payment_id || "").trim();
  if (ext) return ext;
  return String(row?.id ?? "").trim();
}

export function normalizeFingerprintQuery(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/** APG-7F2C-991A */
export function isFingerprintCode(raw) {
  return /^APG-[A-F0-9]{4}-[A-F0-9]{4}$/i.test(String(raw || "").trim());
}

/** pay-… / numeric id / fingerprint — suitable for verify lookup */
export function isReceiptVerifyQuery(raw) {
  const q = String(raw || "").trim();
  if (!q) return false;
  if (isFingerprintCode(q)) return true;
  if (/^pay-/i.test(q)) return true;
  if (/^\d{5,}$/.test(q) && !/[a-z]/i.test(q)) return true;
  return false;
}
