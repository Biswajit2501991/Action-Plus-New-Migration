/** Charge to collect at admission. The plan amount on the member is unchanged. */

export function isAdmissionAmount(value: string | number | undefined) {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) && Number(text) > 0;
}

export function spinChargeInr(amount: string | number | undefined, percent: number) {
  const plan = Math.round(Number(amount) || 0);
  const rate = Math.min(100, Math.max(0, Math.round(Number(percent) || 0)));
  const off = Math.round((plan * rate) / 100);
  return Math.max(0, plan - off);
}

export function isSpinCode(code: string) {
  return /^APG-/i.test(String(code || "").trim());
}
