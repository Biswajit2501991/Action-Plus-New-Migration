"use client";

import { useState } from "react";

export function SpinResult({
  discount,
  couponCode,
  expiresAt,
  preview,
  alreadyUsed,
}: {
  discount: number;
  couponCode: string | null;
  expiresAt: string | null;
  preview?: boolean;
  alreadyUsed?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const expiry = expiresAt
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      }).format(new Date(expiresAt))
    : "";

  return (
    <div className="rounded-2xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-center dark:border-amber-500/30 dark:bg-amber-950/30">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-800 dark:text-amber-200">
        {preview ? "Preview" : alreadyUsed ? "Your prize" : "You won"}
      </p>
      <p className="mt-1 text-3xl font-extrabold text-foreground">{discount}% off</p>
      {preview ? (
        <p className="mt-1 text-sm text-muted-foreground">No coupon was created.</p>
      ) : couponCode ? (
        <>
          <p className="mt-2 font-mono text-lg font-bold tracking-wide text-foreground">{couponCode}</p>
          <button
            type="button"
            className="mt-2 rounded-full border border-amber-400 px-3 py-1 text-xs font-semibold"
            onClick={() => {
              void navigator.clipboard?.writeText(couponCode).then(() => {
                setCopied(true);
              });
            }}
          >
            {copied ? "Copied" : "Copy code"}
          </button>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Show this code at the desk{expiry ? ` before ${expiry}` : ""}. It does not change a saved payment.
            Staff type the discounted amount into Add Payment.
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">This prize was already used.</p>
      )}
    </div>
  );
}
