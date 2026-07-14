"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Plus, Search } from "lucide-react";
import { PageHeader, Skeleton, StatCard } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { useFinance, useMembers, useSettings } from "@/hooks/use-data";
import { financeApi } from "@/services/api";
import {
  buildClientMonthlyReconciliation,
  buildExpensePayload,
  buildFinanceKpis,
  buildFinanceLedgerRows,
  expenseRowsForMonth,
  parseFinanceMonthKey,
  validateExpenseDraft,
} from "@/lib/domain/finance";
import {
  cn,
  downloadTextFile,
  formatCurrency,
  formatDate,
  formatMonthKey,
  toCsv,
} from "@/lib/utils";
import { hasAccess, isMasterOwnerUser } from "@/lib/domain/permissions";
import { localTodayCalendarKey } from "@/lib/domain/billing";
import { useAuthStore } from "@/stores";
import { PaymentQrSettingsPanel } from "@/features/finance/payment-qr-settings-panel";

const PAGE_SIZE = 12;
type FinanceView = "transactions" | "expenses" | "paymentQr";
type TypeFilter = "all" | "income" | "expense";

export function FinancePage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [month, setMonth] = useState(formatMonthKey());
  const [view, setView] = useState<FinanceView>("transactions");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expense, setExpense] = useState({
    amount: "",
    category: "",
    note: "",
    date: localTodayCalendarKey(),
  });

  const { data, isLoading } = useFinance(month);
  const { data: members = [] } = useMembers();
  const { data: settings } = useSettings();

  const canRevenue = hasAccess(user, "finance", "viewRevenueAutoMembers");
  const canExpenseCard = hasAccess(user, "finance", "viewExpenseCard");
  const canProfit = hasAccess(user, "finance", "viewProfitCard");
  const canYtd = hasAccess(user, "finance", "viewYtdCollected");
  const canTransactions = hasAccess(user, "finance", "viewTransactionsAutoMembers");
  const canManageExpenses = hasAccess(user, "finance", "manageExpenses");
  const canManagePaymentQr =
    isMasterOwnerUser(user) || hasAccess(user, "paymentQr", "managePaymentSettings");

  const ledger = useMemo(
    () => buildFinanceLedgerRows(members, data?.transactions || []),
    [members, data?.transactions],
  );

  const clientKpis = useMemo(
    () =>
      buildFinanceKpis(ledger as never, month, {
        financeUseEstimatedExpense: settings?.financeUseEstimatedExpense !== false,
      }),
    [ledger, month, settings?.financeUseEstimatedExpense],
  );

  const summary = (data?.summary || {}) as Record<string, unknown>;
  const collectedRevenue =
    Number(summary.collectedRevenue ?? summary.collected ?? clientKpis.collectedRevenue) || 0;
  const serviceRevenue = Number(summary.serviceRevenue ?? 0) || 0;
  const expenseTotal = Number(summary.expenses ?? summary.expense ?? clientKpis.expense) || 0;
  const profit = Number(summary.profit ?? collectedRevenue - expenseTotal) || 0;
  const ytd = Number(summary.ytdCollected ?? clientKpis.ytdCollected) || 0;
  const growth = Number(summary.revenueGrowthPct ?? clientKpis.revenueGrowthPct) || 0;
  const expenseSubtitle =
    String(summary.expenseSubtitle || "") || clientKpis.expenseSubtitle;

  const year = parseFinanceMonthKey(month)?.year || new Date().getFullYear();
  const reconciliation = useMemo(
    () =>
      buildClientMonthlyReconciliation(ledger, year, {
        useEstimatedExpense: settings?.financeUseEstimatedExpense !== false,
      }),
    [ledger, year, settings?.financeUseEstimatedExpense],
  );

  const filteredLedger = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ledger.filter((row) => {
      const rowMonth = String(row.date || "").slice(0, 7);
      if (month && rowMonth && rowMonth !== month) return false;
      if (typeFilter === "income" && row.type === "expense") return false;
      if (typeFilter === "expense" && row.type !== "expense") return false;
      if (!q) return true;
      const hay = `${row.memberName || ""} ${row.memberId || ""} ${row.plan || ""} ${row.note || ""} ${row.category || ""} ${row.method || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [ledger, month, typeFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredLedger.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageRows = filteredLedger.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const expenseMonthRows = useMemo(
    () => expenseRowsForMonth(ledger, month),
    [ledger, month],
  );

  const addExpense = useMutation({
    mutationFn: async () => {
      const check = validateExpenseDraft({ amount: expense.amount, note: expense.note });
      if (!check.ok) throw new Error(check.error);
      const payload = buildExpensePayload(
        {
          amount: expense.amount,
          category: expense.category || settings?.expenseCategories?.[0] || "General",
          note: expense.note,
          date: expense.date,
        },
        String(user?.name || user?.id || "Staff"),
      );
      return financeApi.addExpense(payload);
    },
    onSuccess: async () => {
      toast.success("Expense added");
      setExpense({
        amount: "",
        category: "",
        note: "",
        date: localTodayCalendarKey(),
      });
      setShowExpenseForm(false);
      await qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = () => {
    const rows = filteredLedger.map((r) => ({
      date: r.date || "",
      type: r.type || "",
      member: r.memberName || "",
      memberId: r.memberId || "",
      plan: r.plan || "",
      category: r.category || "",
      method: r.method || "",
      amount: r.amount,
      status: r.status || "",
      note: r.note || "",
      source: r.source || "",
    }));
    downloadTextFile(`finance-${month}.csv`, toCsv(rows));
  };

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Finance"
        description="Collected revenue, expenses, profit, reconciliation, and ledger."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="month"
              className="h-9 w-44"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setPage(1);
              }}
            />
            {canManageExpenses ? (
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                onClick={() => {
                  setView("transactions");
                  setShowExpenseForm((v) => !v);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Expense
              </Button>
            ) : null}
            {canTransactions ? (
              <Button size="sm" variant="outline" className="h-9" onClick={exportCsv}>
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            { key: "transactions" as const, label: "Transactions" },
            { key: "expenses" as const, label: "Expenses" },
            ...(canManagePaymentQr
              ? [{ key: "paymentQr" as const, label: "Payment QR" }]
              : []),
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setView(tab.key)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
              view === tab.key
                ? "border-slate-900 bg-slate-900 text-white dark:border-teal-400 dark:bg-teal-400 dark:text-slate-950"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-border dark:bg-card",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {canRevenue ? (
          <StatCard
            label="Collected Revenue"
            value={formatCurrency(collectedRevenue)}
            trend={`${growth}%`}
            hint={serviceRevenue ? `Service revenue ${formatCurrency(serviceRevenue)}` : undefined}
            tone="teal"
          />
        ) : null}
        {canExpenseCard ? (
          <StatCard
            label="Expenses"
            value={formatCurrency(expenseTotal)}
            hint={expenseSubtitle}
            tone="rose"
          />
        ) : null}
        {canProfit ? (
          <StatCard label="Profit" value={formatCurrency(profit)} tone="emerald" />
        ) : null}
        {canYtd ? (
          <StatCard label="YTD Collected" value={formatCurrency(ytd)} tone="sky" />
        ) : null}
      </div>

      {canManageExpenses && showExpenseForm && view === "transactions" ? (
        <Card className="border-rose-100 shadow-sm dark:border-border">
          <CardContent className="grid gap-3 p-4 md:grid-cols-5">
            <div>
              <Label>Date</Label>
              <Input
                className="mt-1"
                type="date"
                value={expense.date}
                onChange={(e) => setExpense((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div>
              <Label>Amount</Label>
              <Input
                className="mt-1"
                type="number"
                value={expense.amount}
                onChange={(e) => setExpense((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div>
              <Label>Category</Label>
              <Select
                className="mt-1"
                value={expense.category}
                onChange={(e) => setExpense((f) => ({ ...f, category: e.target.value }))}
              >
                <option value="">Select</option>
                {(settings?.expenseCategories || ["Rent", "Utilities", "Salaries", "Other"]).map(
                  (c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ),
                )}
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Note</Label>
              <Input
                className="mt-1"
                value={expense.note}
                onChange={(e) => setExpense((f) => ({ ...f, note: e.target.value }))}
                placeholder="Required expense note"
              />
            </div>
            <div className="flex items-end md:col-span-5">
              <Button onClick={() => addExpense.mutate()} disabled={addExpense.isPending}>
                {addExpense.isPending ? "Saving…" : "Save expense"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {view === "paymentQr" ? (
        <PaymentQrSettingsPanel />
      ) : view === "transactions" ? (
        <>
          <Card className="border-slate-200 shadow-sm dark:border-border">
            <CardContent className="space-y-3 p-4">
              <div>
                <h2 className="text-sm font-semibold">Monthly Reconciliation · {year}</h2>
                <p className="text-xs text-muted-foreground">
                  Click a month to focus the ledger. Expenses may use 26% estimate when no rows exist.
                </p>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-border">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-700 dark:bg-muted dark:text-muted-foreground">
                      <th className="px-3 py-2 text-left font-semibold">Month</th>
                      <th className="px-3 py-2 text-right font-semibold">Collected</th>
                      <th className="px-3 py-2 text-right font-semibold">Expenses</th>
                      <th className="px-3 py-2 text-right font-semibold">Profit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconciliation.map((row) => {
                      const active = row.monthKey === month;
                      return (
                        <tr
                          key={row.monthKey}
                          className={cn(
                            "cursor-pointer border-t border-slate-100 dark:border-border",
                            active && "bg-sky-50 dark:bg-sky-950/30",
                          )}
                          onClick={() => {
                            setMonth(row.monthKey);
                            setPage(1);
                          }}
                        >
                          <td className="px-3 py-2 font-medium">{row.label}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatCurrency(row.incomeCollected)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-rose-700">
                            {formatCurrency(row.expenses)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">
                            {formatCurrency(row.profit)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {canTransactions ? (
            <Card className="border-slate-200 shadow-sm dark:border-border">
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold">Recorded Payments & Expenses</h2>
                    <p className="text-xs text-muted-foreground">
                      Member payments + manual rows · {filteredLedger.length} in view
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <Input
                        className="h-9 w-[200px] pl-8"
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value);
                          setPage(1);
                        }}
                        placeholder="Search ledger…"
                      />
                    </div>
                    <div className="inline-flex rounded-full border border-slate-200 p-0.5 dark:border-border">
                      {(
                        [
                          { key: "all" as const, label: "All" },
                          { key: "income" as const, label: "Income" },
                          { key: "expense" as const, label: "Expense" },
                        ] as const
                      ).map((chip) => (
                        <button
                          key={chip.key}
                          type="button"
                          onClick={() => {
                            setTypeFilter(chip.key);
                            setPage(1);
                          }}
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                            typeFilter === chip.key
                              ? "bg-sky-600 text-white"
                              : "text-slate-600 hover:bg-slate-50 dark:text-muted-foreground",
                          )}
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-border">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-xs text-slate-600 dark:bg-muted dark:text-muted-foreground">
                        <th className="px-3 py-2.5 font-semibold">Date</th>
                        <th className="px-3 py-2.5 font-semibold">Type</th>
                        <th className="px-3 py-2.5 font-semibold">Member / Category</th>
                        <th className="px-3 py-2.5 font-semibold">Plan</th>
                        <th className="px-3 py-2.5 font-semibold">Method</th>
                        <th className="px-3 py-2.5 font-semibold">Amount</th>
                        <th className="px-3 py-2.5 font-semibold">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r) => (
                        <tr
                          key={r.id}
                          className="border-t border-slate-100 dark:border-border"
                        >
                          <td className="whitespace-nowrap px-3 py-2">{formatDate(r.date)}</td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                r.type === "expense"
                                  ? "border-rose-200 bg-rose-50 text-rose-800"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-800",
                              )}
                            >
                              {r.type || "income"}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {r.memberName || r.category || "—"}
                            {r.memberId ? (
                              <span className="ml-1 text-xs text-muted-foreground">
                                · {r.memberId}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">{r.plan || "—"}</td>
                          <td className="px-3 py-2">{r.method || "—"}</td>
                          <td
                            className={cn(
                              "whitespace-nowrap px-3 py-2 font-semibold tabular-nums",
                              r.type === "expense" ? "text-rose-700" : "text-emerald-700",
                            )}
                          >
                            {formatCurrency(r.amount)}
                          </td>
                          <td className="max-w-[200px] truncate px-3 py-2 text-xs text-muted-foreground">
                            {r.note || "—"}
                          </td>
                        </tr>
                      ))}
                      {!pageRows.length ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="px-3 py-8 text-center text-sm text-muted-foreground"
                          >
                            No ledger rows for this filter.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 ? (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Page {safePage} of {totalPages}
                    </span>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={safePage <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        Prev
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={safePage >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : (
        <Card className="border-rose-100 shadow-sm dark:border-border">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Expenses · {month}</h2>
                <p className="text-xs text-muted-foreground">
                  {expenseMonthRows.length} row{expenseMonthRows.length === 1 ? "" : "s"} · Total{" "}
                  <span className="font-semibold text-rose-700">
                    {formatCurrency(
                      expenseMonthRows.reduce((s, r) => s + Number(r.amount || 0), 0),
                    )}
                  </span>
                </p>
              </div>
              {canManageExpenses ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setView("transactions");
                    setShowExpenseForm(true);
                  }}
                >
                  Add expense
                </Button>
              ) : null}
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-border">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-rose-50 text-left text-xs text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
                    <th className="px-3 py-2.5 font-semibold">Date</th>
                    <th className="px-3 py-2.5 font-semibold">Category</th>
                    <th className="px-3 py-2.5 font-semibold">Amount</th>
                    <th className="px-3 py-2.5 font-semibold">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseMonthRows.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100 dark:border-border">
                      <td className="whitespace-nowrap px-3 py-2">{formatDate(r.date)}</td>
                      <td className="px-3 py-2">{r.category || r.memberName || "General"}</td>
                      <td className="whitespace-nowrap px-3 py-2 font-semibold text-rose-700">
                        {formatCurrency(r.amount)}
                      </td>
                      <td className="max-w-[280px] truncate px-3 py-2 text-xs text-muted-foreground">
                        {r.note || "—"}
                      </td>
                    </tr>
                  ))}
                  {!expenseMonthRows.length ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-8 text-center text-sm text-muted-foreground"
                      >
                        No expenses logged for this month.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
