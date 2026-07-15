"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ClassicalModal } from "@/components/ui/classical-modal";
import { localTodayCalendarKey } from "@/lib/domain/billing";
import type { ReactivationFeeRule } from "@/lib/domain/billing";

export type ReactivationFeePrompt = {
  memberId: string;
  memberName?: string;
  nextStatus: string;
  inactiveMonths: number;
  admissionType: ReactivationFeeRule["admissionType"];
  reactivationFee: string;
  baseAmount: string;
  billingDate: string;
};

export type ReactivationFeeConfirm = {
  memberId: string;
  nextStatus: string;
  amount: string;
  billingDate: string;
  total: number;
};

type Props = {
  prompt: ReactivationFeePrompt | null;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (values: ReactivationFeeConfirm) => void | Promise<void>;
};

export function ReactivationFeeModal({ prompt, saving, onClose, onConfirm }: Props) {
  const [reactivationFee, setReactivationFee] = useState("");
  const [baseAmount, setBaseAmount] = useState("");
  const [billingDate, setBillingDate] = useState(localTodayCalendarKey());
  const [error, setError] = useState("");

  useEffect(() => {
    if (!prompt) return;
    setReactivationFee(prompt.reactivationFee || "");
    setBaseAmount(prompt.baseAmount || "");
    setBillingDate(prompt.billingDate || localTodayCalendarKey());
    setError("");
  }, [prompt]);

  if (!prompt) return null;

  const feeLabel =
    prompt.admissionType === "full" ? "Full Admission Fee (₹)" : "Readmission Fee (₹)";
  const feeNum = Number(reactivationFee);
  const baseNum = Number(baseAmount);
  const total =
    (Number.isFinite(feeNum) ? feeNum : 0) + (Number.isFinite(baseNum) ? baseNum : 0);

  const submit = async () => {
    if (!Number.isFinite(feeNum) || feeNum <= 0) {
      setError(
        `${prompt.admissionType === "full" ? "Full admission fee" : "Readmission fee"} must be a positive amount.`,
      );
      return;
    }
    if (!Number.isFinite(baseNum) || baseNum < 0) {
      setError("Base amount cannot be negative.");
      return;
    }
    if (!String(billingDate || "").trim()) {
      setError("Please select billing date.");
      return;
    }
    setError("");
    const roundedTotal = Number(total.toFixed(2));
    await onConfirm({
      memberId: prompt.memberId,
      nextStatus: prompt.nextStatus || "Active",
      amount: String(Math.round(roundedTotal)),
      billingDate: String(billingDate).trim(),
      total: roundedTotal,
    });
  };

  return (
    <ClassicalModal
      open
      title="Reactivation Fee Required"
      description={
        prompt.memberName
          ? `${prompt.memberName} · inactive ${prompt.inactiveMonths} months`
          : `Inactive period is ${prompt.inactiveMonths} months`
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={saving}
            className="border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-950/50 dark:text-emerald-200"
          >
            Accept & Activate
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-muted-foreground">
          Inactive period is {prompt.inactiveMonths} months (
          {prompt.admissionType === "full"
            ? "over 12 months"
            : "over 6 months, up to 12 months"}
          ).{" "}
          {prompt.admissionType === "full"
            ? "Full admission fee is mandatory."
            : "Readmission fee is required."}
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="md:col-span-2 space-y-1.5">
            <Label>Billing Date (default: today)</Label>
            <Input
              type="date"
              value={billingDate}
              onChange={(e) => setBillingDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{feeLabel}</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              value={reactivationFee}
              placeholder="Enter positive amount"
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  setReactivationFee("");
                  return;
                }
                const n = Number(raw);
                if (!Number.isFinite(n) || n <= 0) return;
                setReactivationFee(String(n));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Base Amount (₹)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={baseAmount}
              placeholder="0.00"
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  setBaseAmount("");
                  return;
                }
                const n = Number(raw);
                if (!Number.isFinite(n) || n < 0) return;
                setBaseAmount(String(n));
              }}
            />
          </div>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-200">
          Total Amount: ₹{total.toLocaleString()}
        </div>
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      </div>
    </ClassicalModal>
  );
}

export function buildReactivationFeePrompt(
  member: {
    memberId: string;
    name?: string;
    amount?: number | string;
    status?: string | null;
    billingDate?: string | null;
  },
  nextStatus = "Active",
  rule: ReactivationFeeRule,
): ReactivationFeePrompt {
  return {
    memberId: member.memberId,
    memberName: member.name,
    nextStatus,
    inactiveMonths: rule.months,
    admissionType: rule.admissionType,
    reactivationFee: "",
    baseAmount: String(Number(member.amount || 0) || ""),
    billingDate: localTodayCalendarKey(),
  };
}
