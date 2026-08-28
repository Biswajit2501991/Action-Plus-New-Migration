import { describe, expect, it } from "vitest";
import { createHmac } from "crypto";
import {
  isFingerprintCode,
  isReceiptVerifyQuery,
  paymentPublicId,
  receiptFingerprint,
} from "./receiptFingerprint.js";

describe("receiptFingerprint", () => {
  it("receiptFingerprint matches website APG-XXXX-XXXX shape", () => {
    const prev = process.env.MEMBER_PORTAL_JWT_SECRET;
    process.env.MEMBER_PORTAL_JWT_SECRET = "test-secret-for-fingerprint";
    try {
      const fp = receiptFingerprint({
        gymId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        memberId: 42,
        paymentId: "pay-1784981404086-zwf8g",
      });
      expect(fp).toMatch(/^APG-[A-F0-9]{4}-[A-F0-9]{4}$/);
      const again = receiptFingerprint({
        gymId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        memberId: 42,
        paymentId: "pay-1784981404086-zwf8g",
      });
      expect(fp).toBe(again);
      // Same algorithm as website (inline check)
      const digest = createHmac("sha256", "test-secret-for-fingerprint")
        .update(
          `receipt-fp:v1:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:42:pay-1784981404086-zwf8g`,
        )
        .digest("hex")
        .toUpperCase();
      expect(fp).toBe(`APG-${digest.slice(0, 4)}-${digest.slice(4, 8)}`);
    } finally {
      if (prev == null) delete process.env.MEMBER_PORTAL_JWT_SECRET;
      else process.env.MEMBER_PORTAL_JWT_SECRET = prev;
    }
  });

  it("isFingerprintCode and isReceiptVerifyQuery", () => {
    expect(isFingerprintCode("APG-7F2C-991A")).toBe(true);
    expect(isFingerprintCode("apg-7f2c-991a")).toBe(true);
    expect(isFingerprintCode("APG-ZZZZ-991A")).toBe(false);
    expect(isReceiptVerifyQuery("pay-1784981404086-zwf8g")).toBe(true);
    expect(isReceiptVerifyQuery("227189")).toBe(true);
    expect(isReceiptVerifyQuery("John")).toBe(false);
  });

  it("paymentPublicId prefers external id", () => {
    expect(
      paymentPublicId({ id: 9, external_payment_id: "pay-1" }),
    ).toBe("pay-1");
    expect(paymentPublicId({ id: 9, external_payment_id: null })).toBe("9");
  });
});
