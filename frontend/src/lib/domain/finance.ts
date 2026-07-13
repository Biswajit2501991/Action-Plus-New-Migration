import type { FinanceTransaction } from "@/types";
import { formatMonthKey } from "@/lib/utils";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function parseFinanceMonthKey(monthKey?: string | null) {
  const m = String(monthKey || "").trim();
  const match = /^(\d{4})-(\d{2})$/.exec(m);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function shiftFinanceMonthKey(monthKey: string, deltaMonths: number) {
  const parsed = parseFinanceMonthKey(monthKey);
  if (!parsed) return "";
  let { year, month } = parsed;
  month += deltaMonths;
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  return `${year}-${pad2(month)}`;
}

export function revenueGrowthPercent(current: number, previous: number) {
  const cur = Number(current || 0);
  const prev = Number(previous || 0);
  if (!prev) return cur ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

function txMonthKey(t: FinanceTransaction) {
  const raw = String(t.paidAt || t.date || "");
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return raw.slice(0, 7);
  }
  return formatMonthKey(d);
}

export function sumCollectedIncomeForMonthKey(transactions: FinanceTransaction[], monthKey: string) {
  return (transactions || [])
    .filter((t) => t && t.type !== "expense" && t.status !== "pending" && txMonthKey(t) === monthKey)
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
}

export function sumExpensesForMonthKey(transactions: FinanceTransaction[], monthKey: string) {
  return (transactions || [])
    .filter((t) => t && t.type === "expense" && txMonthKey(t) === monthKey)
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
}

const ESTIMATE_RATE = 0.26;

export function buildFinanceKpis(
  transactions: FinanceTransaction[],
  financeMonth: string,
  settings: { financeUseEstimatedExpense?: boolean } = {},
) {
  const monthKey = String(financeMonth || formatMonthKey());
  const parsed = parseFinanceMonthKey(monthKey);
  const year = parsed?.year || new Date().getFullYear();
  const month = parsed?.month || new Date().getMonth() + 1;
  const prevMonthKey = shiftFinanceMonthKey(monthKey, -1);

  const collectedRevenue = sumCollectedIncomeForMonthKey(transactions, monthKey);
  const prevMonthCollected = sumCollectedIncomeForMonthKey(transactions, prevMonthKey);
  const actualExpense = sumExpensesForMonthKey(transactions, monthKey);
  const estimatedExpense = Math.round(collectedRevenue * ESTIMATE_RATE);
  const useEstimated = settings.financeUseEstimatedExpense !== false;
  const expense = actualExpense > 0 ? actualExpense : estimatedExpense;
  const profit = collectedRevenue - expense;

  let ytdCollected = 0;
  for (let m = 1; m <= month; m += 1) {
    ytdCollected += sumCollectedIncomeForMonthKey(transactions, `${year}-${pad2(m)}`);
  }

  const last4: { month: string; revenue: number }[] = [];
  for (let i = 3; i >= 0; i -= 1) {
    const key = shiftFinanceMonthKey(monthKey, -i);
    last4.push({ month: key, revenue: sumCollectedIncomeForMonthKey(transactions, key) });
  }

  return {
    monthKey,
    collectedRevenue,
    prevMonthCollected,
    revenueGrowthPct: revenueGrowthPercent(collectedRevenue, prevMonthCollected),
    expense,
    actualExpense,
    estimatedExpense,
    expenseSubtitle:
      actualExpense > 0
        ? "Actual expense rows"
        : useEstimated
          ? "Estimated (26% of collected revenue)"
          : "26% estimate (no expense rows this month)",
    profit,
    ytdCollected,
    ytdProfit: ytdCollected - (actualExpense > 0 ? actualExpense : estimatedExpense),
    trend: last4,
  };
}
