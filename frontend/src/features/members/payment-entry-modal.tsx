"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { membersApi } from "@/services/api";
import { ApiError } from "@/services/api/client";
import { formatMonthKey } from "@/lib/utils";
import type { Member, Payment } from "@/types";

type PayForm = {
  amount: string;
  paidAt: string;
  paidMonth: string;
  method: string;
  note: string;
};

type Props = {
  member: Member;
  payment?: Payment | null;
  paymentMethods?: string[];
  canDelete?: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

function isoDateOnly(value?: string | null) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function paymentIdOf(p: Payment) {
  return String(p.id || p.paymentId || "").trim();
}

export function PaymentEntryModal({
  member,
  payment = null,
  paymentMethods,
  canDelete = false,
  onClose,
  onSaved,
}: Props) {
  const editing = Boolean(payment && paymentIdOf(payment));
  const methods = paymentMethods?.length
    ? paymentMethods
    : ["Cash", "UPI", "Card", "Bank Transfer"];

  const [form, setForm] = useState<PayForm>(() => ({
    amount: payment?.amount != null ? String(payment.amount) : String(member.amount || ""),
    paidAt: isoDateOnly(String(payment?.paidAt || payment?.paid_at || "")),
    paidMonth: String(
      payment?.paidMonth || payment?.paid_month || formatMonthKey(),
    ).slice(0, 7),
    method: String(payment?.method || methods[0] || "Cash"),
    note: String(payment?.note || ""),
  }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [pendingOverride, setPendingOverride] = useState<{
    existingAmount?: number;
    requestedAmount?: number;
  } | null>(null);

  const title = useMemo(
    () => (editing ? "Update Payment" : "Record payment"),
    [editing],
  );

  const applyPaidForMonth = async (confirmOverride: boolean, reason?: string) => {
    const amount = Number(form.amount || 0);
    const monthKey = form.paidMonth.slice(0, 7);
    return membersApi.setPaidForMonth(member.memberId, monthKey, {
      amount,
      confirmOverride,
      overrideReason: reason || null,
    });
  };

  const save = async (confirmOverride = false) => {
    setError("");
    const amount = Number(form.amount || 0);
    if (!(amount > 0)) {
      setError("Enter a valid amount.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.paidAt)) {
      setError("Invalid payment date.");
      return;
    }
    if (!/^\d{4}-\d{2}$/.test(form.paidMonth)) {
      setError("Select Paid for Month (month and year).");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        amount,
        paidAt: new Date(`${form.paidAt}T12:00:00`).toISOString(),
        paidMonth: form.paidMonth,
        method: form.method,
        note: form.note,
        recordedBy: undefined as string | undefined,
        source: "manual",
      };

      if (editing && payment) {
        await membersApi.updatePayment(member.memberId, paymentIdOf(payment), payload);
      } else {
        await membersApi.addPayment(member.memberId, {
          ...payload,
          paymentId: `pay_${Date.now()}`,
        });
      }

      try {
        await applyPaidForMonth(confirmOverride, overrideReason);
      } catch (err) {
        if (
          err instanceof ApiError &&
          (err.status === 409 || err.code === "amount-override-confirmation-required")
        ) {
          const body = (err.details || {}) as {
            existingAmount?: number;
            requestedAmount?: number;
          };
          setPendingOverride({
            existingAmount: body.existingAmount,
            requestedAmount: body.requestedAmount ?? amount,
          });
          setOverrideOpen(true);
          setSaving(false);
          return;
        }
        // Payment saved; paid-for-month is best-effort if endpoint rejects for other reasons
        console.warn("paid-for-month sync failed", err);
      }

      toast.success(editing ? "Payment updated" : "Payment recorded");
      setOverrideOpen(false);
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save payment");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!payment || !canDelete) return;
    const id = paymentIdOf(payment);
    if (!id) return;
    if (!window.confirm("Delete this payment entry? This cannot be undone from the UI.")) {
      return;
    }
    setSaving(true);
    try {
      await membersApi.deletePayment(member.memberId, id);
      toast.success("Payment deleted");
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete payment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border bg-background p-6 shadow-2xl">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">
          {member.name || member.memberId} · plan {member.plan || "—"}
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Amount (INR)</label>
            <Input
              className="mt-1"
              type="number"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Payment Date</label>
            <Input
              className="mt-1"
              type="date"
              value={form.paidAt}
              onChange={(e) => setForm({ ...form, paidAt: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Paid for Month</label>
            <Input
              className="mt-1"
              type="month"
              value={form.paidMonth}
              onChange={(e) => setForm({ ...form, paidMonth: e.target.value })}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Used for Finance revenue attribution.
            </p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Payment Method</label>
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
            <label className="text-xs text-muted-foreground">Note (optional)</label>
            <Input
              className="mt-1"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="e.g. April dues cleared"
            />
          </div>
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {editing && canDelete ? (
            <Button variant="destructive" onClick={() => void remove()} disabled={saving}>
              Delete Payment
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save(false)} disabled={saving}>
            {saving ? "Saving…" : editing ? "Update Payment" : "Save Payment"}
          </Button>
        </div>
      </div>

      {overrideOpen ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm space-y-3 rounded-2xl border bg-background p-5 shadow-2xl">
            <h3 className="text-base font-semibold">Revenue record already exists</h3>
            <p className="text-sm text-muted-foreground">
              Existing amount: ₹{Number(pendingOverride?.existingAmount || 0).toLocaleString("en-IN")}
              <br />
              Requested amount: ₹
              {Number(pendingOverride?.requestedAmount || form.amount || 0).toLocaleString("en-IN")}
            </p>
            <p className="text-sm">Do you want to override this value?</p>
            <div>
              <label className="text-xs text-muted-foreground">Reason (optional)</label>
              <Input
                className="mt-1"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="e.g. discount correction"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setOverrideOpen(false);
                  toast.success(editing ? "Payment updated" : "Payment recorded");
                  void onSaved();
                  onClose();
                }}
              >
                No — Keep Existing
              </Button>
              <Button
                onClick={() => void save(true)}
                disabled={saving}
              >
                Yes — Update
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
