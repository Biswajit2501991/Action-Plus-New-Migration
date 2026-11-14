import { describe, expect, it } from "vitest";
import {
  admissionFeeNote,
  isAdmissionAmount,
  isSpinCode,
  spinChargeInr,
} from "../frontend/src/lib/domain/spin-admission.ts";

describe("spin admission charge", () => {
  it("needs a whole amount above zero", () => {
    expect(isAdmissionAmount("")).toBe(false);
    expect(isAdmissionAmount("0")).toBe(false);
    expect(isAdmissionAmount("3000")).toBe(true);
  });

  it("takes the percent off the typed amount", () => {
    expect(spinChargeInr(3000, 10)).toBe(2700);
    expect(spinChargeInr("1500", 5)).toBe(1425);
  });

  it("keeps the plan fee and the collect amount on separate lines", () => {
    expect(admissionFeeNote(2000, 1880)).toBe(
      "Plan amount ₹2000. This is saved on the member.\nCollect ₹1880 in Add Payment.",
    );
  });

  it("treats only APG codes as spin codes", () => {
    expect(isSpinCode("APG-AB12")).toBe(true);
    expect(isSpinCode("apg-zz")).toBe(true);
    expect(isSpinCode("RAJA1")).toBe(false);
  });
});
