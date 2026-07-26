"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Loader2, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { membersApi } from "@/services/api";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

export type ReceiptVerifyResult = Awaited<ReturnType<typeof membersApi.verifyReceipt>>;

type VerifyReceiptModalProps = {
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
  onOpenMember?: (memberId: string) => void;
};

/** Shape used to auto-detect receipt codes (not phone / member search). */
export function isReceiptVerifyQuery(raw: string): boolean {
  const q = String(raw || "").trim();
  if (!q) return false;
  if (/^APG-[A-F0-9]{4}-[A-F0-9]{4}$/i.test(q)) return true;
  if (/^pay-/i.test(q)) return true;
  return false;
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5 last:border-b-0 dark:border-white/[0.06]">
      <dt className="shrink-0 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
        {label}
      </dt>
      <dd
        className={cn(
          "text-right text-sm font-medium text-slate-800 dark:text-slate-100",
          mono && "break-all font-mono text-[12px] tracking-wide",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function VerifyReceiptModal({
  open,
  initialQuery = "",
  onClose,
  onOpenMember,
}: VerifyReceiptModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReceiptVerifyResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery || "");
    setError(null);
    setResult(null);
  }, [open, initialQuery]);

  // Lock page scroll while open (same pattern as Hold Members / Edit Member).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const runVerify = useCallback(async (raw: string) => {
    const q = String(raw || "").trim();
    if (!q) {
      setError("Enter a verify code such as APG-7F2C-991A.");
      setResult(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await membersApi.verifyReceipt(q);
      setResult(data);
      if (!data.found) {
        setError(data.message || "No matching payment found.");
      }
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Could not verify receipt");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const q = String(initialQuery || "").trim();
    if (q && isReceiptVerifyQuery(q)) {
      void runVerify(q);
    }
  }, [open, initialQuery, runVerify]);

  if (!open) return null;

  const found = Boolean(result?.found);
  const amountLabel = found
    ? formatCurrency(Number(result?.payment?.amount || 0))
    : null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto overscroll-contain bg-slate-950/55 p-3 backdrop-blur-[3px] sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="verify-receipt-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative my-auto flex max-h-[min(92dvh,920px)] w-full max-w-lg flex-col overflow-hidden rounded-[28px] border border-slate-200/90 bg-[#fbfaf7] shadow-[0_40px_120px_-48px_rgba(15,23,42,0.75)] dark:border-white/10 dark:bg-[#0e131a]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/70 to-transparent" />
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-amber-300/15 blur-3xl dark:bg-amber-400/10" />

        {/* Sticky header — X always visible */}
        <div className="relative z-10 flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/70 bg-[#fbfaf7]/95 px-5 pb-3 pt-5 backdrop-blur-sm dark:border-white/10 dark:bg-[#0e131a]/95 sm:px-6">
          <div className="min-w-0 pr-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-400">
              Action Plus Gym
            </p>
            <h2
              id="verify-receipt-title"
              className="mt-1.5 font-serif text-[1.65rem] font-semibold tracking-tight text-slate-900 dark:text-slate-50"
            >
              Verify receipt
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Confirm a printed or shared receipt against gym payment records.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-950 dark:border-white/25 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>

        {/* Scrollable body — same pattern as Hold Members / Edit Member */}
        <div className="relative min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Verify code
            </label>
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runVerify(query);
                }}
                placeholder="APG-7F2C-991A"
                className="h-11 border-slate-200/90 bg-[#fbfaf7] font-mono text-[13px] tracking-wider dark:bg-black/20"
                autoFocus={!initialQuery}
              />
              <Button
                type="button"
                disabled={busy}
                onClick={() => void runVerify(query)}
                className="h-11 shrink-0 rounded-xl bg-slate-900 px-5 text-white hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Verify
              </Button>
            </div>
          </div>

          {error && !found ? (
            <div className="rounded-2xl border border-rose-200/80 bg-rose-50/90 px-4 py-3 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/35 dark:text-rose-200">
              {error}
            </div>
          ) : null}

          {found && result ? (
            <div className="overflow-hidden rounded-[22px] border border-slate-200/90 bg-white shadow-[0_18px_50px_-34px_rgba(15,23,42,0.45)] dark:border-white/10 dark:bg-[#121821]">
              <div className="border-b border-slate-100 bg-gradient-to-b from-emerald-50/90 to-white px-5 py-5 text-center dark:border-white/10 dark:from-emerald-950/40 dark:to-[#121821]">
                <div className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-300/70 bg-emerald-100/80 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-200">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  Genuine
                </div>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Amount paid
                </p>
                <p className="mt-1 font-serif text-4xl font-semibold tracking-tight text-slate-900 tabular-nums dark:text-slate-50">
                  {amountLabel}
                </p>
                <p className="mt-2 font-mono text-[12px] tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  {result.fingerprint}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Matched by{" "}
                  {result.matchType === "fingerprint" ? "verify code" : "payment id"}
                </p>
              </div>

              <dl className="px-5 py-2">
                <Row label="Paid at" value={formatDate(result.payment?.paidAt) || "—"} />
                <Row label="Method" value={result.payment?.method || "—"} />
                <Row
                  label="Billing month"
                  value={
                    result.payment?.paidMonth || result.payment?.billingMonth || "—"
                  }
                />
                <Row label="Receipt id" value={result.payment?.id || "—"} mono />
                {result.payment?.note ? (
                  <Row label="Note" value={result.payment.note} />
                ) : null}
              </dl>

              {result.member ? (
                <div className="mx-5 mb-5 rounded-2xl border border-slate-200/80 bg-[#fbfaf7] px-4 py-3.5 dark:border-white/10 dark:bg-white/[0.03]">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Member
                  </p>
                  <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-50">
                    {result.member.name}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {result.member.memberId}
                    {result.member.status ? ` · ${result.member.status}` : ""}
                    {result.member.planName ? ` · ${result.member.planName}` : ""}
                    {result.member.mobile ? ` · ${result.member.mobile}` : ""}
                  </p>
                  {onOpenMember && result.member.memberId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-3 rounded-full"
                      onClick={() => onOpenMember(result.member!.memberId)}
                    >
                      Open member
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Sticky footer — Close always reachable */}
        <div className="relative z-10 flex shrink-0 items-center justify-between gap-3 border-t border-slate-200/70 bg-[#fbfaf7]/95 px-5 py-3 backdrop-blur-sm dark:border-white/10 dark:bg-[#0e131a]/95 sm:px-6">
          <p className="text-[11px] text-slate-400">Read-only · gym records are final</p>
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
