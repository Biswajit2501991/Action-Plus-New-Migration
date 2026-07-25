"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Loader2, Search } from "lucide-react";
import { ClassicalModal } from "@/components/ui/classical-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { membersApi } from "@/services/api";
import { formatCurrency, formatDate } from "@/lib/utils";

export type ReceiptVerifyResult = Awaited<ReturnType<typeof membersApi.verifyReceipt>>;

type VerifyReceiptModalProps = {
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
  onOpenMember?: (memberId: string) => void;
};

export function isReceiptVerifyQuery(raw: string): boolean {
  const q = String(raw || "").trim();
  if (!q) return false;
  if (/^APG-[A-F0-9]{4}-[A-F0-9]{4}$/i.test(q)) return true;
  if (/^pay-/i.test(q)) return true;
  if (/^\d{5,}$/.test(q) && !/[a-z]/i.test(q)) return true;
  return false;
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

  const runVerify = useCallback(async (raw: string) => {
    const q = String(raw || "").trim();
    if (!q) {
      setError("Enter a verify code (e.g. APG-7F2C-991A) or receipt / payment id.");
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

  return (
    <ClassicalModal
      open={open}
      onClose={onClose}
      title="Verify receipt"
      description="Enter the verify code from a member receipt (APG-XXXX-XXXX), or the receipt / payment id. Read-only — nothing is changed."
      size="md"
      footer={
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runVerify(query);
            }}
            placeholder="APG-7F2C-991A or pay-…"
            className="font-mono text-sm"
            autoFocus
          />
          <Button
            type="button"
            disabled={busy}
            onClick={() => void runVerify(query)}
            className="shrink-0 bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Verify
          </Button>
        </div>

        {error && !(result?.found) ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-200">
            {error}
          </p>
        ) : null}

        {result?.found ? (
          <div className="space-y-3 rounded-2xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/90 to-white p-4 dark:border-emerald-500/25 dark:from-emerald-950/40 dark:to-slate-950">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
              <BadgeCheck className="h-5 w-5" />
              <span className="text-sm font-semibold">
                Genuine payment found
                {result.matchType === "fingerprint" ? " (verify code)" : " (payment id)"}
              </span>
            </div>

            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Verify code</dt>
                <dd className="font-mono font-semibold tracking-wide text-foreground">
                  {result.fingerprint}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Amount</dt>
                <dd className="font-semibold tabular-nums text-foreground">
                  {formatCurrency(Number(result.payment?.amount || 0))}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Paid at</dt>
                <dd>{formatDate(result.payment?.paidAt) || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Method</dt>
                <dd>{result.payment?.method || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Billing month</dt>
                <dd>{result.payment?.paidMonth || result.payment?.billingMonth || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Receipt id</dt>
                <dd className="break-all text-right font-mono text-xs">
                  {result.payment?.id || "—"}
                </dd>
              </div>
              {result.payment?.note ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Note</dt>
                  <dd className="text-right">{result.payment.note}</dd>
                </div>
              ) : null}
            </dl>

            {result.member ? (
              <div className="rounded-xl border border-black/[0.06] bg-white/80 px-3 py-3 dark:border-white/10 dark:bg-white/[0.04]">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Member
                </p>
                <p className="mt-1 font-medium text-foreground">{result.member.name}</p>
                <p className="text-xs text-muted-foreground">
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
                    className="mt-2"
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
    </ClassicalModal>
  );
}
