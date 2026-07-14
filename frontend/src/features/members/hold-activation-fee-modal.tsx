"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type HoldActivationPromptState = {
  memberId: string;
  memberName?: string;
  nextStatus: "Active";
  inactiveMonths: number;
  admissionType: "full" | "readmission";
  baseAmount: string;
  billingDate: string;
  pendingEdit?: Record<string, unknown> | null;
};

type Props = {
  prompt: HoldActivationPromptState;
  saving?: boolean;
  onCancel: () => void;
  onConfirm: (values: {
    reactivationFee: number;
    baseAmount: number;
    billingDate: string;
    total: number;
  }) => void | Promise<void>;
};

/** Months between billing date and today (legacy inactive period). */
export function inactiveMonthsFromBilling(billingDate?: string | null) {
  const raw = String(billingDate || "").trim();
  if (!raw) return 0;
  const start = new Date(raw);
  if (Number.isNaN(start.getTime())) return 0;
  const now = new Date();
  const months =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth());
  return Math.max(0, months);
}

export function getReactivationFeeRule(inactiveMonths: number): {
  admissionType: "full" | "readmission";
} | null {
  if (inactiveMonths > 12) return { admissionType: "full" };
  if (inactiveMonths > 6) return { admissionType: "readmission" };
  return null;
}

export function HoldActivationFeeModal({
  prompt,
  saving = false,
  onCancel,
  onConfirm,
}: Props) {
  const [fee, setFee] = useState("");
  const [base, setBase] = useState(prompt.baseAmount || "");
  const [billingDate, setBillingDate] = useState(
    prompt.billingDate || new Date().toISOString().slice(0, 10),
  );
  const [error, setError] = useState("");

  const total = useMemo(() => {
    const f = Number(fee || 0);
    const b = Number(base || 0);
    return Math.round((Number.isFinite(f) ? f : 0) + (Number.isFinite(b) ? b : 0));
  }, [fee, base]);

  const label =
    prompt.admissionType === "full" ? "Full Admission Fee (₹)" : "Readmission Fee (₹)";
  const periodCopy =
    prompt.admissionType === "full"
      ? "over 12 months. Full admission fee is mandatory."
      : "over 6 months, up to 12 months. Readmission fee is required.";

  const submit = async () => {
    const f = Number(fee || 0);
    const b = Number(base || 0);
    if (!(f > 0)) {
      setError(
        `${prompt.admissionType === "full" ? "Full admission fee" : "Readmission fee"} must be a positive amount.`,
      );
      return;
    }
    if (b < 0) {
      setError("Base amount cannot be negative.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(billingDate)) {
      setError("Please select billing date.");
      return;
    }
    setError("");
    await onConfirm({
      reactivationFee: f,
      baseAmount: b,
      billingDate,
      total,
    });
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md space-y-3 rounded-2xl border bg-background p-5 shadow-2xl">
        <h2 className="text-lg font-semibold">Reactivation Fee Required</h2>
        <p className="text-sm text-muted-foreground">
          Inactive period is {prompt.inactiveMonths} months ({periodCopy})
          {prompt.memberName ? ` · ${prompt.memberName}` : ""}
        </p>
        <div>
          <label className="text-xs text-muted-foreground">Billing Date (default: today)</label>
          <Input
            className="mt-1"
            type="date"
            value={billingDate}
            onChange={(e) => setBillingDate(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">{label}</label>
          <Input
            className="mt-1"
            type="number"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            placeholder="Enter fee"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Base Amount (₹)</label>
          <Input
            className="mt-1"
            type="number"
            value={base}
            onChange={(e) => setBase(e.target.value)}
          />
        </div>
        <p className="text-sm font-semibold">
          Total Amount: ₹{total.toLocaleString("en-IN")}
        </p>
        {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Saving…" : "Accept & Activate"}
          </Button>
        </div>
      </div>
    </div>
  );
}
