"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/services/api/client";

type Report = {
  spins: number;
  people: number;
  issued: number;
  redeemed: number;
  discountTotal: number;
  byDiscount: { discount: number; count: number }[];
};

export function SpinWheelAnalytics({
  branches,
}: {
  branches: { id: string; label: string }[];
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [branchId, setBranchId] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (branchId) params.set("branchId", branchId);
    const query = params.toString();
    apiFetch<Report>(`/spin-wheel/report${query ? `?${query}` : ""}`)
      .then((next) => {
        setReport(next);
        setError("");
      })
      .catch(() => setError("The report could not be loaded."));
  }, [from, to, branchId]);

  return (
    <div className="space-y-3 rounded-2xl border border-border p-3">
      <p className="text-sm font-semibold">Spin report</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-xs text-muted-foreground">
          From
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          To
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Branch
          <select
            value={branchId}
            onChange={(event) => setBranchId(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground"
          >
            <option value="">All branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {report ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Spins" value={report.spins} />
            <Stat label="People" value={report.people} />
            <Stat label="Coupons" value={report.issued} />
            <Stat label="Redeemed" value={report.redeemed} />
          </div>
          <p className="text-xs text-muted-foreground">
            Redeemed discount total is {report.discountTotal} percentage points. This is not a rupee total and it does
            not change Finance.
          </p>
          {report.byDiscount.length ? (
            <ul className="text-sm">
              {report.byDiscount.map((row) => (
                <li key={row.discount} className="flex justify-between border-b border-border/70 py-1">
                  <span>{row.discount}% wins</span>
                  <span>{row.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No spins in this range.</p>
          )}
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-muted/50 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
