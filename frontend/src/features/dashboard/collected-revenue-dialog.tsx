"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  buildFinanceLedgerRows,
  collectedIncomeRowsForMonth,
  expenseRowsForMonth,
  type FinanceLedgerRow,
} from "@/lib/domain/finance";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import type { FinanceTransaction, Member } from "@/types";

type Props = {
  open: boolean;
  monthKey: string;
  collectedRevenue: number;
  members: Member[];
  transactions: FinanceTransaction[];
  canViewExpenses: boolean;
  onClose: () => void;
};

function monthTitle(monthKey: string) {
  const [y, m] = String(monthKey || "").split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  if (Number.isNaN(date.getTime())) return monthKey;
  return date.toLocaleString("en", { month: "long", year: "numeric" });
}

function rowTotal(rows: FinanceLedgerRow[]) {
  return rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

function RowList({
  rows,
  empty,
  kind,
}: {
  rows: FinanceLedgerRow[];
  empty: string;
  kind: "paid" | "expense";
}) {
  if (!rows.length) {
    return <p className="px-3 py-6 text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="max-h-64 divide-y divide-border overflow-y-auto">
      {rows.map((row) => (
        <li key={row.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
          <div className="min-w-0">
            <p className="truncate font-medium">
              {kind === "paid"
                ? row.memberName || row.memberId || "Member"
                : row.category || row.memberName || "Expense"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {formatDate(row.date)}
              {kind === "paid" && row.method ? ` · ${row.method}` : ""}
              {kind === "expense" && row.note ? ` · ${row.note}` : ""}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 font-semibold tabular-nums",
              kind === "expense" ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300",
            )}
          >
            {formatCurrency(row.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CollectedRevenueDialog({
  open,
  monthKey,
  collectedRevenue,
  members,
  transactions,
  canViewExpenses,
  onClose,
}: Props) {
  const router = useRouter();
  const ledger = useMemo(
    () => (open ? buildFinanceLedgerRows(members, transactions) : []),
    [open, members, transactions],
  );
  const paidRows = useMemo(
    () => (open ? collectedIncomeRowsForMonth(ledger, monthKey) : []),
    [open, ledger, monthKey],
  );
  const expenseRows = useMemo(
    () => (open ? expenseRowsForMonth(ledger, monthKey) : []),
    [open, ledger, monthKey],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-3"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="collected-revenue-dialog-title"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-teal-200 bg-background shadow-xl dark:border-teal-800"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-teal-100 bg-teal-50 px-5 py-4 dark:border-teal-900 dark:bg-teal-950/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-800/80 dark:text-teal-200/80">
                {monthTitle(monthKey)}
              </p>
              <h2 id="collected-revenue-dialog-title" className="text-lg font-semibold">
                Collected Revenue
              </h2>
              <p className="mt-1 text-2xl font-bold tabular-nums">{formatCurrency(collectedRevenue)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                This is the same amount on the dashboard box. The lists below are this month’s rows only.
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        <div className="grid gap-4 overflow-y-auto p-4 sm:grid-cols-2">
          <section className="overflow-hidden rounded-2xl border">
            <div className="flex items-center justify-between gap-2 border-b bg-emerald-50/80 px-3 py-2 dark:bg-emerald-950/30">
              <h3 className="text-sm font-semibold">Member paid</h3>
              <span className="text-xs font-semibold tabular-nums text-emerald-800 dark:text-emerald-200">
                {paidRows.length} · {formatCurrency(rowTotal(paidRows))}
              </span>
            </div>
            <RowList rows={paidRows} kind="paid" empty="No member payments this month." />
          </section>

          <section className="overflow-hidden rounded-2xl border">
            <div className="flex items-center justify-between gap-2 border-b bg-rose-50/80 px-3 py-2 dark:bg-rose-950/30">
              <h3 className="text-sm font-semibold">Expense added</h3>
              {canViewExpenses ? (
                <span className="text-xs font-semibold tabular-nums text-rose-800 dark:text-rose-200">
                  {expenseRows.length} · {formatCurrency(rowTotal(expenseRows))}
                </span>
              ) : null}
            </div>
            {canViewExpenses ? (
              <RowList rows={expenseRows} kind="expense" empty="No expenses added this month." />
            ) : (
              <p className="px-3 py-6 text-sm text-muted-foreground">
                Expense lines stay in Finance for people who can open the expense card.
              </p>
            )}
          </section>
        </div>

        <div className="flex justify-end border-t px-4 py-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onClose();
              router.push("/finance");
            }}
          >
            Open Finance
          </Button>
        </div>
      </div>
    </div>
  );
}
