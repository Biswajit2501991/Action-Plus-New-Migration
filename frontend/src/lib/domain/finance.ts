import type { FinanceTransaction, Member, Payment } from "@/types";
import { formatMonthKey } from "@/lib/utils";
import { localCalendarDateKey } from "@/lib/domain/billing";

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

function txMonthKey(t: { paidAt?: string; date?: string; [k: string]: unknown }) {
  const raw = String(t.paidAt || t.date || "");
  if (!raw) return "";
  const key = localCalendarDateKey(raw);
  if (key) return key.slice(0, 7);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 7);
  return formatMonthKey(d);
}

export function sumCollectedIncomeForMonthKey(
  transactions: Array<{ type?: string; status?: string; amount?: number; paidAt?: string; date?: string }>,
  monthKey: string,
) {
  return (transactions || [])
    .filter(
      (t) =>
        t &&
        t.type !== "expense" &&
        String(t.status || "").toLowerCase() !== "pending" &&
        txMonthKey(t) === monthKey,
    )
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
}

export function sumExpensesForMonthKey(
  transactions: Array<{ type?: string; amount?: number; paidAt?: string; date?: string }>,
  monthKey: string,
) {
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

export type FinanceLedgerRow = {
  id: string;
  type: "income" | "expense" | string;
  source?: string;
  memberId?: string;
  memberName?: string;
  date?: string;
  paidMonth?: string;
  plan?: string;
  method?: string;
  amount: number;
  status?: string;
  note?: string;
  category?: string;
};

function normalizePaymentHistory(member: Member): Payment[] {
  return Array.isArray(member.paymentHistory) ? member.paymentHistory : [];
}

/** Production-style ledger: member payments + manual finance rows. */
export function buildFinanceLedgerRows(
  members: Member[],
  financeTransactions: FinanceTransaction[],
): FinanceLedgerRow[] {
  const paymentRows: FinanceLedgerRow[] = [];
  for (const m of members || []) {
    if (!m) continue;
    const memberId = String(m.memberId || "").trim();
    for (const h of normalizePaymentHistory(m)) {
      const day = localCalendarDateKey(
        String(h.paidAt || h.paid_at || (h as { receivedAt?: string }).receivedAt || ""),
      );
      const amount = Number(h.amount || 0);
      if (!day || amount <= 0) continue;
      paymentRows.push({
        id: `pay-${memberId}-${String(h.id || day)}`,
        type: "income",
        source: "payment",
        memberId,
        memberName: m.name || "",
        date: day,
        paidMonth: String(h.paidMonth || h.paid_month || "").slice(0, 7),
        plan: m.plan || "",
        method: String(h.method || m.paymentMethod || "").trim(),
        amount,
        status: "paid",
        note: String(h.note || "").trim(),
      });
    }
  }

  const manual = (financeTransactions || []).map((t) => {
    const day =
      localCalendarDateKey(String(t.date || t.paidAt || "")) || String(t.date || "").slice(0, 10);
    return {
      id: String(t.id || t.externalTxId || `manual-${day}`),
      type: t.type === "expense" ? "expense" : "income",
      source: String(t.source || "manual"),
      memberId: String(t.memberId || ""),
      memberName:
        String(t.memberName || "") ||
        (t.type === "expense" ? String(t.category || "Expense") : ""),
      date: day,
      plan: String(t.plan || (t.type === "expense" ? "Expense" : "")),
      method: String(t.method || "Cash"),
      amount: Number(t.amount || 0),
      status: String(t.status || (t.type === "expense" ? "posted" : "paid")),
      note: String(t.note || t.description || ""),
      category: String(t.category || ""),
    } as FinanceLedgerRow;
  });

  const paymentIds = new Set(paymentRows.map((r) => r.id));
  const uniqueManual = manual.filter((r) => {
    if (r.source === "payment") return !paymentIds.has(r.id);
    return true;
  });

  return [...paymentRows, ...uniqueManual].sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || "")),
  );
}

export function validateExpenseDraft(draft: { amount?: unknown; note?: unknown }) {
  const amount = Number(draft?.amount || 0);
  if (!amount || amount <= 0) {
    return { ok: false as const, error: "Please enter a valid expense amount." };
  }
  if (!String(draft?.note || "").trim()) {
    return { ok: false as const, error: "Expense note is required." };
  }
  return { ok: true as const };
}

export function buildExpensePayload(
  draft: { amount?: unknown; category?: string; note?: string; date?: string },
  actor: string,
) {
  const noteBase = String(draft.note || "").trim();
  const note = /added by:/i.test(noteBase)
    ? noteBase
    : [noteBase, `Added by: ${actor}`].filter(Boolean).join(" • ");
  const dateRaw = String(draft.date || "").trim();
  return {
    type: "expense",
    amount: Number(draft.amount || 0),
    category: String(draft.category || "General").trim() || "General",
    note,
    date: dateRaw.length >= 10 ? dateRaw.slice(0, 10) : localCalendarDateKey(new Date()),
    status: "posted",
    method: "Cash",
  };
}

export function buildClientMonthlyReconciliation(
  ledger: FinanceLedgerRow[],
  year: number,
  options: { useEstimatedExpense?: boolean } = {},
) {
  const useEstimated = options.useEstimatedExpense !== false;
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const rows = [];
  for (let m = 1; m <= 12; m += 1) {
    const monthKey = `${year}-${pad2(m)}`;
    const incomeCollected = sumCollectedIncomeForMonthKey(ledger, monthKey);
    const actualExpenses = sumExpensesForMonthKey(ledger, monthKey);
    const estimated = Math.round(incomeCollected * ESTIMATE_RATE);
    const expenses = actualExpenses > 0 ? actualExpenses : useEstimated ? estimated : 0;
    rows.push({
      monthKey,
      label: `${labels[m - 1]} ${year}`,
      incomeCollected,
      expenses,
      actualExpenses,
      profit: incomeCollected - expenses,
    });
  }
  return rows;
}

export function expenseRowsForMonth(ledger: FinanceLedgerRow[], monthKey: string) {
  return (ledger || []).filter((t) => t.type === "expense" && txMonthKey(t) === monthKey);
}
