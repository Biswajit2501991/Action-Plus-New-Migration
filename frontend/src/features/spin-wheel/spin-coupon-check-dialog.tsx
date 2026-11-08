"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { membersApi } from "@/services/api";

type CouponNote = { tone: "ok" | "bad"; text: string };

export function SpinCouponCheckDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<CouponNote | null>(null);

  if (!open) return null;

  async function check() {
    const next = code.trim().toUpperCase();
    if (!next) {
      setNote({ tone: "bad", text: "Enter a Spin code." });
      return;
    }
    setBusy(true);
    try {
      const found = await membersApi.lookupSpinCoupon(next);
      const coupon = found.coupon;
      if (!coupon || coupon.status !== "issued") {
        setNote({
          tone: "bad",
          text:
            coupon?.status === "redeemed"
              ? "This Spin code was already used."
              : coupon?.status === "expired"
                ? "This Spin code has expired."
                : "This Spin code cannot be used.",
        });
        return;
      }
      setNote({
        tone: "ok",
        text: `${coupon.code} is ready at ${coupon.discount}% off. Enter it on Add New Member after the amount. This check does not save a payment.`,
      });
    } catch {
      setNote({ tone: "bad", text: "Code not found." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="spin-check-title"
        className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl"
      >
        <button
          type="button"
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border border-border"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <p id="spin-check-title" className="pr-10 text-lg font-semibold">
          Check a coupon
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          See if a Spin code can still be used. This does not change a member or a payment.
        </p>
        <div className="mt-4 flex gap-2">
          <Input
            value={code}
            placeholder="APG-XXXXXXXX"
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void check();
              }
            }}
          />
          <Button type="button" disabled={busy} onClick={() => void check()}>
            Check
          </Button>
        </div>
        {note ? (
          <p className={`mt-3 text-sm ${note.tone === "ok" ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600"}`}>
            {note.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}
