"use client";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader, Skeleton, StatCard } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { useFinance, useSettings } from "@/hooks/use-data";
import { financeApi } from "@/services/api";
import { buildFinanceKpis } from "@/lib/domain/finance";
import { formatCurrency, formatDate, formatMonthKey } from "@/lib/utils";
import { hasAccess } from "@/lib/domain/permissions";
import { useAuthStore } from "@/stores";

export function FinancePage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [month, setMonth] = useState(formatMonthKey());
  const { data, isLoading } = useFinance(month);
  const { data: settings } = useSettings();
  const [expense, setExpense] = useState({ amount: "", category: "", description: "" });
  const kpis = useMemo(() => buildFinanceKpis(data?.transactions || [], month, settings || {}), [data, month, settings]);
  const rows = useMemo(() => (data?.transactions || []).filter((t) => {
    const raw = String(t.paidAt || t.date || "");
    return !month || raw.startsWith(month) || (raw && formatMonthKey(new Date(raw)) === month);
  }), [data, month]);

  const addExpense = useMutation({
    mutationFn: () => financeApi.addExpense({
      amount: Number(expense.amount || 0),
      category: expense.category,
      description: expense.description,
      date: new Date().toISOString(),
      type: "expense",
    }),
    onSuccess: async () => {
      toast.success("Expense added");
      setExpense({ amount: "", category: "", description: "" });
      await qc.invalidateQueries({ queryKey: ["finance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="grid gap-4 md:grid-cols-4">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-28"/>)}</div>;

  return (
    <div>
      <PageHeader title="Finance" description="Collected revenue, expenses, profit, and ledger." actions={
        <Input type="month" className="w-44" value={month} onChange={(e) => setMonth(e.target.value)} />
      } />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Collected" value={formatCurrency(kpis.collectedRevenue)} trend={`${kpis.revenueGrowthPct}%`} />
        <StatCard label="Expenses" value={formatCurrency(kpis.expense)} hint={kpis.expenseSubtitle} />
        <StatCard label="Profit" value={formatCurrency(kpis.profit)} />
        <StatCard label="YTD" value={formatCurrency(kpis.ytdCollected)} />
      </div>
      {hasAccess(user, "finance", "manageExpenses") ? (
        <Card className="mt-6">
          <CardHeader><CardTitle>Add expense</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <div><Label>Amount</Label><Input className="mt-1" type="number" value={expense.amount} onChange={(e)=>setExpense({...expense, amount:e.target.value})} /></div>
            <div>
              <Label>Category</Label>
              <Select className="mt-1" value={expense.category} onChange={(e)=>setExpense({...expense, category:e.target.value})}>
                <option value="">Select</option>
                {(settings?.expenseCategories || ["Rent","Utilities","Salaries","Other"]).map((c)=><option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div><Label>Description</Label><Input className="mt-1" value={expense.description} onChange={(e)=>setExpense({...expense, description:e.target.value})} /></div>
            <div className="flex items-end"><Button className="w-full" onClick={()=>addExpense.mutate()} disabled={addExpense.isPending}>Save expense</Button></div>
          </CardContent>
        </Card>
      ) : null}
      <Card className="mt-6">
        <CardHeader><CardTitle>Transactions</CardTitle></CardHeader>
        <CardContent className="overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2">Date</th><th>Type</th><th>Category</th><th>Description</th><th>Amount</th></tr></thead>
            <tbody>
              {rows.map((t, i) => (
                <tr key={String(t.id || t.externalTxId || i)} className="border-b border-border/50">
                  <td className="py-2">{formatDate(String(t.paidAt || t.date || ""))}</td>
                  <td>{t.type || "income"}</td>
                  <td>{t.category || "—"}</td>
                  <td>{t.description || "—"}</td>
                  <td className="font-medium">{formatCurrency(Number(t.amount || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
