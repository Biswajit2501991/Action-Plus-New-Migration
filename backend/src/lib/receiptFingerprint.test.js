import { createHmac } from "crypto";
import assert from "node:assert/strict";
import test from "node:test";
import {
  isFingerprintCode,
  isReceiptVerifyQuery,
  paymentPublicId,
  receiptFingerprint,
} from "./receiptFingerprint.js";

test("receiptFingerprint matches website APG-XXXX-XXXX shape", () => {
  const prev = process.env.MEMBER_PORTAL_JWT_SECRET;
  process.env.MEMBER_PORTAL_JWT_SECRET = "test-secret-for-fingerprint";
  try {
    const fp = receiptFingerprint({
      gymId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      memberId: 42,
      paymentId: "pay-1784981404086-zwf8g",
    });
    assert.match(fp, /^APG-[A-F0-9]{4}-[A-F0-9]{4}$/);
    const again = receiptFingerprint({
      gymId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      memberId: 42,
      paymentId: "pay-1784981404086-zwf8g",
    });
    assert.equal(fp, again);
    // Same algorithm as website (inline check)
    const digest = createHmac("sha256", "test-secret-for-fingerprint")
      .update(
        `receipt-fp:v1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:42:pay-1784981404086-zwf8g`,
      )
      .digest("hex")
      .toUpperCase();
    assert.equal(fp, `APG-${digest.slice(0, 4)}-${digest.slice(4, 8)}`);
  } finally {
    if (prev == null) delete process.env.MEMBER_PORTAL_JWT_SECRET;
    else process.env.MEMBER_PORTAL_JWT_SECRET = prev;
  }
});

test("isFingerprintCode and isReceiptVerifyQuery", () => {
  assert.equal(isFingerprintCode("APG-7F2C-991A"), true);
  assert.equal(isFingerprintCode("apg-7f2c-991a"), true);
  assert.equal(isFingerprintCode("APG-ZZZZ-991A"), false);
  assert.equal(isReceiptVerifyQuery("pay-1784981404086-zwf8g"), true);
  assert.equal(isReceiptVerifyQuery("227189"), true);
  assert.equal(isReceiptVerifyQuery("John"), false);
});

test("paymentPublicId prefers external id", () => {
  assert.equal(
    paymentPublicId({ id: 9, external_payment_id: "pay-1" }),
    "pay-1",
  );
  assert.equal(paymentPublicId({ id: 9, external_payment_id: null }), "9");
});
