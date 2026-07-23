import { describe, expect, it } from "vitest";
import {
  formatReminderAmountWithReferralCredit,
  paymentAmountWithReferralCredit,
  templateUsesReferralCreditInAmount,
} from "../frontend/src/lib/domain/referral-billing.ts";

describe("referral credit on billing reminder", () => {
  it("formats reminder amount with pending credit", () => {
    expect(formatReminderAmountWithReferralCredit(699, 0)).toBe("699");
    expect(formatReminderAmountWithReferralCredit(699, 50)).toBe(
      "699- 50(referral credit) = 649/-",
    );
    expect(paymentAmountWithReferralCredit(699, 50)).toBe(649);
  });

  it("only reminder templates use referral credit in amount", () => {
    expect(templateUsesReferralCreditInAmount("reminder")).toBe(true);
    expect(templateUsesReferralCreditInAmount("monthReminder")).toBe(true);
    expect(templateUsesReferralCreditInAmount("fine")).toBe(false);
    expect(templateUsesReferralCreditInAmount("success")).toBe(false);
  });
});
