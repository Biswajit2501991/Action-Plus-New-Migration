"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ClassicalModal } from "@/components/ui/classical-modal";
import { formatCurrency } from "@/lib/utils";

type Props = {
  open: boolean;
  monthKey: string;
  currentAmount?: number;
  nextAmount: number;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    amount: number;
    confirmOverride: boolean;
    overrideReason: string;
  }) => void | Promise<void>;
};

export function PaidForMonthOverrideDialog({
  open,
  monthKey,
  currentAmount,
  nextAmount,
  saving,
  onClose,
  onConfirm,
}: Props) {
  const needsOverride =
    currentAmount != null &&
    Number.isFinite(currentAmount) &&
    Math.abs(Number(currentAmount) - Number(nextAmount)) > 0.009;
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setReason("");
      setError("");
    }
  }, [open]);

  const submit = async () => {
    if (needsOverride && reason.trim().length < 3) {
      setError("Add a short reason for changing the recorded month amount.");
      return;
    }
    await onConfirm({
      amount: nextAmount,
      confirmOverride: needsOverride,
      overrideReason: reason.trim(),
    });
  };

  return (
    <ClassicalModal
      open={open}
      title="Update paid-for-month"
      description={`Confirm amount for ${monthKey}.`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={saving}
            className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
          >
            {saving ? "Saving…" : "Confirm"}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex justify-between gap-3">
            <span className="text-slate-500">Current</span>
            <span className="font-semibold">
              {currentAmount != null ? formatCurrency(currentAmount) : "—"}
            </span>
          </div>
          <div className="mt-1 flex justify-between gap-3">
            <span className="text-slate-500">New amount</span>
            <span className="font-semibold">{formatCurrency(nextAmount)}</span>
          </div>
        </div>
        {needsOverride ? (
          <div>
            <Label>Override reason</Label>
            <Input
              className="mt-1"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Partial collection correction"
            />
          </div>
        ) : (
          <p className="text-xs text-slate-500">No amount change — membership month tag will update.</p>
        )}
        {error ? <p className="text-xs text-rose-600">{error}</p> : null}
      </div>
    </ClassicalModal>
  );
}
