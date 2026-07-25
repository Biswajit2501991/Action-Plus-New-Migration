"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { ClassicalModal } from "@/components/ui/classical-modal";
import { formatMonthKey } from "@/lib/utils";
import { paymentAmountWithReferralCredit } from "@/lib/domain/referral-billing";
import { reminderReferralCollectAmount } from "@/lib/domain/whatsapp";
import { membersApi } from "@/services/api";
import type { Member, Payment } from "@/types";

export type PaymentFormValues = {
  amount: string;
  method: string;
  note: string;
  paidAt: string;
  paidMonth: string;
};

type Props = {
  open: boolean;
  member: Member | null;
  payment?: Payment | null;
  methods?: string[];
  saving?: boolean;
  onClose: () => void;
  onSave: (values: PaymentFormValues) => void | Promise<void>;
};

function toDateInputValue(iso?: string) {
  if (!iso) return new Date().toISOString().slice(0, 10);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export function PaymentEntryModal({
  open,
  member,
  payment,
  methods = ["Cash", "UPI", "Card", "Bank"],
  saving,
  onClose,
  onSave,
}: Props) {
  const editing = Boolean(payment?.id);
  const [pendingCreditInr, setPendingCreditInr] = useState(0);
  const [creditLoading, setCreditLoading] = useState(false);
  const reminderNetAmount = useMemo(
    () => reminderReferralCollectAmount(member),
    [member],
  );

  useEffect(() => {
    if (!open || editing || !member?.memberId) {
      setPendingCreditInr(0);
      return;
    }
    let cancelled = false;
    setCreditLoading(true);
    void membersApi
      .referralCredits(String(member.memberId))
      .then((res) => {
        if (!cancelled) setPendingCreditInr(Number(res.pendingCreditInr) || 0);
      })
      .catch(() => {
        if (!cancelled) setPendingCreditInr(0);
      })
      .finally(() => {
        if (!cancelled) setCreditLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, editing, member?.memberId]);

  const defaults = useMemo<PaymentFormValues>(() => {
    const paidMonth =
      String(payment?.paidMonth || payment?.paid_month || "").trim() ||
      formatMonthKey();
    const planAmount = Number(member?.amount || 0) || 0;
    let collectAmount = planAmount;
    let creditNote = "";
    if (!editing) {
      if (pendingCreditInr > 0) {
        collectAmount = paymentAmountWithReferralCredit(planAmount, pendingCreditInr);
        creditNote = `Referral credit ₹${pendingCreditInr} will apply (one-time)`;
      } else if (reminderNetAmount > 0) {
        collectAmount = reminderNetAmount;
        creditNote = `Referral credit already applied on reminder (collect ₹${reminderNetAmount})`;
      }
    }
    const amount =
      payment?.amount != null ? String(payment.amount) : String(collectAmount || "");
    return {
      amount,
      method: String(payment?.method || member?.paymentMethod || methods[0] || "Cash"),
      note: String(payment?.note || creditNote || ""),
      paidAt: toDateInputValue(String(payment?.paidAt || payment?.paid_at || "")),
      paidMonth: /^\d{4}-\d{2}$/.test(paidMonth) ? paidMonth : formatMonthKey(),
    };
  }, [payment, member, methods, pendingCreditInr, reminderNetAmount, editing]);

  const [form, setForm] = useState(defaults);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setForm(defaults);
      setError("");
    }
  }, [open, defaults]);

  const submit = async () => {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid amount greater than zero.");
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(form.paidMonth)) {
      setError("Paid for month must be YYYY-MM.");
      return;
    }
    setError("");
    await onSave(form);
  };

  return (
    <ClassicalModal
      open={open}
      title={editing ? "Edit payment" : "Record payment"}
      description={
        member
          ? `${member.name || member.memberId} · ${member.plan || "No plan"}`
          : undefined
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
            className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
          >
            {saving ? "Saving…" : editing ? "Save changes" : "Save payment"}
          </Button>
        </>
      }
    >
      {!editing && pendingCreditInr > 0 ? (
        <div className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
          Referral credit ₹{pendingCreditInr} will apply (one-time). Plan amount stays{" "}
          {Number(member?.amount || 0)}. Default collect is plan − credit.
        </div>
      ) : null}
      {!editing && pendingCreditInr <= 0 && reminderNetAmount > 0 ? (
        <div className="mb-3 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-800 dark:text-sky-200">
          Referral credit was already applied on the billing reminder. Default collect is ₹
          {reminderNetAmount} (plan {Number(member?.amount || 0)}).
        </div>
      ) : null}
      {!editing && creditLoading ? (
        <p className="mb-2 text-xs text-muted-foreground">Checking referral credits…</p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Amount</Label>
          <Input
            className="mt-1"
            type="number"
            min={0}
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </div>
        <div>
          <Label>Method</Label>
          <Select
            className="mt-1"
            value={form.method}
            onChange={(e) => setForm({ ...form, method: e.target.value })}
          >
            {methods.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Payment date</Label>
          <Input
            className="mt-1"
            type="date"
            value={form.paidAt}
            onChange={(e) => setForm({ ...form, paidAt: e.target.value })}
          />
        </div>
        <div>
          <Label>Paid for month</Label>
          <Input
            className="mt-1"
            type="month"
            value={form.paidMonth}
            onChange={(e) => setForm({ ...form, paidMonth: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <Label>Note</Label>
          <Input
            className="mt-1"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="Optional reference"
          />
        </div>
        {error ? (
          <p className="sm:col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            {error}
          </p>
        ) : null}
      </div>
    </ClassicalModal>
  );
}
