"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Plus, Search, SlidersHorizontal } from "lucide-react";
import { Badge, PageHeader, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { useFinance, useMembers, useSettings } from "@/hooks/use-data";
import { buildFinanceKpis, shiftFinanceMonthKey } from "@/lib/domain/finance";
import {
  birthdaysThisMonth,
  countByStatus,
  expiringSoon,
  memberSearchHaystack,
  recentPayments,
} from "@/lib/domain/members";
import { isPaymentByPastDue, overdueDaysForMember } from "@/lib/domain/billing";
import {
  buildMembershipPlanDistribution,
  planDistributionConicGradient,
} from "@/lib/domain/plan-distribution";
import { formatCurrency, formatDate, formatMonthKey, cn } from "@/lib/utils";
import { hasAccess } from "@/lib/domain/permissions";
import { useAuthStore, useUiStore } from "@/stores";
import type { Member } from "@/types";
import { MessagePreviewModal } from "@/features/whatsapp/message-preview-modal";
import { useWhatsappSend } from "@/features/whatsapp/use-whatsapp-send";

const STATUS_TILES: { key: "Active" | "Hold" | "Deactivated" | "Cancelled"; tone: string }[] = [
  { key: "Active", tone: "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300" },
  { key: "Hold", tone: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-300" },
  { key: "Deactivated", tone: "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300" },
  { key: "Cancelled", tone: "bg-slate-100 border-slate-200 text-slate-800 dark:bg-slate-900/60 dark:border-slate-700 dark:text-slate-300" },
];

type OverdueMember = Member & { overdueDays: number };

function OverdueRow({
  m,
  expanded,
  onToggle,
  onReminder,
}: {
  m: OverdueMember;
  expanded: boolean;
  onToggle: () => void;
  onReminder: (member: Member) => void;
}) {
  return (
    <>
      <tr className="border-b border-border/60 hover:bg-accent/40">
        <td className="whitespace-nowrap px-4 py-3 font-medium">{m.name || "—"}</td>
        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{m.memberId}</td>
        <td className="whitespace-nowrap px-4 py-3">{m.plan || "—"}</td>
        <td className="whitespace-nowrap px-4 py-3">{formatCurrency(Number(m.amount || 0))}</td>
        <td className="whitespace-nowrap px-4 py-3">{m.overdueDays}</td>
        <td className="whitespace-nowrap px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!m.mobile}
              onClick={() => onReminder(m)}
            >
              Reminder
            </Button>
            <Button size="sm" variant="ghost" onClick={onToggle}>
              {expanded ? "Hide Details" : "View Details"}
            </Button>
          </div>
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-border/60 bg-muted/30">
          <td colSpan={6} className="px-4 py-3 text-xs text-muted-foreground">
            Mobile: {m.mobile || "—"} · Billing: {formatDate(m.billingDate)} · Email: {m.email || "—"} ·
            Status: {m.status || "Active"}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function matchesField(m: Member, q: string, field: string) {
  const query = q.trim().toLowerCase();
  if (!query) return true;
  if (field === "all") return memberSearchHaystack(m).includes(query);
  if (field === "name") return String(m.name || "").toLowerCase().includes(query);
  if (field === "mobile") return String(m.mobile || "").toLowerCase().includes(query);
  if (field === "memberId") return String(m.memberId || "").toLowerCase().includes(query);
  if (field === "email") return String(m.email || "").toLowerCase().includes(query);
  if (field === "plan") return String(m.plan || "").toLowerCase().includes(query);
  if (field === "status") return String(m.status || "").toLowerCase().includes(query);
  if (field === "staff") return String(m.trainerId || "").toLowerCase().includes(query);
  return memberSearchHaystack(m).includes(query);
}

export function DashboardPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setAddMemberOpen = useUiStore((s) => s.setAddMemberOpen);
  const month = formatMonthKey();
  const { data: members = [], isLoading: loadingMembers } = useMembers();
  const { data: finance, isLoading: loadingFinance } = useFinance(month);
  const { data: settings } = useSettings();
  const {
    preview: waPreview,
    sending: waSending,
    openPreview: openWhatsAppPreview,
    closePreview: closeWhatsAppPreview,
    confirmSend: confirmWhatsAppSend,
  } = useWhatsappSend();

  const [q, setQ] = useState("");
  const [field, setField] = useState("all");
  const [expandedOverdueId, setExpandedOverdueId] = useState("");

  const canCore = hasAccess(user, "dashboard", "viewDashboardCore");
  const canRevenue = hasAccess(user, "dashboard", "viewRevenueMonthly");
  const canTrend = hasAccess(user, "dashboard", "viewRevenueTrend");
  const canPlans = hasAccess(user, "dashboard", "viewMembershipTrends");
  const canOverdue = hasAccess(user, "dashboard", "viewOverdueRetentionAlerts");
  const canExpense = hasAccess(user, "finance", "manageExpenses");

  const summary = (finance?.summary || {}) as {
    collectedRevenue?: number;
    revenueGrowthPct?: number;
    profit?: number;
    prevMonthCollected?: number;
  };
  const kpis = useMemo(
    () =>
      buildFinanceKpis(finance?.transactions || [], month, {
        financeUseEstimatedExpense: settings?.financeUseEstimatedExpense !== false,
      }),
    [finance?.transactions, month, settings?.financeUseEstimatedExpense],
  );

  // Prefer server finance summary (prod behavior) when present.
  const collectedRevenue =
    summary.collectedRevenue != null ? Number(summary.collectedRevenue) : kpis.collectedRevenue;
  const growthRate =
    summary.revenueGrowthPct != null ? Number(summary.revenueGrowthPct) : kpis.revenueGrowthPct;
  const profit = summary.profit != null ? Number(summary.profit) : kpis.profit;
  const prevMonthCollected =
    summary.prevMonthCollected != null ? Number(summary.prevMonthCollected) : kpis.prevMonthCollected;

  const statusCounts = useMemo(() => countByStatus(members), [members]);
  const expiring = useMemo(() => expiringSoon(members, 14), [members]);
  const birthdays = useMemo(() => birthdaysThisMonth(members), [members]);
  const payments = useMemo(() => recentPayments(members, 8), [members]);

  const planDistribution = useMemo(
    () =>
      buildMembershipPlanDistribution(members, {
        topN: 6,
        canonicalPlans: settings?.plans || [],
      }),
    [members, settings?.plans],
  );
  const planPie = useMemo(
    () => planDistributionConicGradient(planDistribution),
    [planDistribution],
  );

  const overdueList = useMemo(() => {
    return members
      .filter((m) => isPaymentByPastDue(m))
      .map((m) => ({
        ...m,
        overdueDays: overdueDaysForMember(m),
      }))
      .sort((a, b) => b.overdueDays - a.overdueDays);
  }, [members]);

  const trendData = useMemo(() => {
    // Prefer KPI last-4 + extend to 6 months from ledger like prod "last 6 months".
    const rows: { month: string; label: string; revenue: number }[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const key = shiftFinanceMonthKey(month, -i);
      const fromKpi = kpis.trend.find((t) => t.month === key);
      const [y, mo] = key.split("-");
      const label = new Date(Number(y), Number(mo) - 1, 1).toLocaleString("en", {
        month: "short",
      }) + `-${String(y).slice(-2)}`;
      rows.push({
        month: key,
        label,
        revenue:
          key === month
            ? collectedRevenue
            : fromKpi?.revenue ??
              buildFinanceKpis(finance?.transactions || [], key, settings || {}).collectedRevenue,
      });
    }
    return rows;
  }, [month, kpis.trend, collectedRevenue, finance?.transactions, settings]);

  const goMembers = (status?: string, search = "", searchField = "all") => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (search.trim()) {
      params.set("q", search.trim());
      params.set("field", searchField);
    }
    router.push(`/members?${params.toString()}`);
  };

  if (loadingMembers || loadingFinance) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const nothingEnabled =
    !canCore && !canRevenue && !canTrend && !canPlans && !canOverdue;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        description="Same production widgets — modern Action Plus shell."
        actions={
          canCore ? (
            <>
              <Button variant="outline" size="sm" onClick={() => router.push("/members")}>
                <SlidersHorizontal className="h-4 w-4" />
                Filter
              </Button>
              {canExpense ? (
                <Button variant="outline" size="sm" onClick={() => router.push("/finance")}>
                  ₹ Add Expense
                </Button>
              ) : null}
              <Button
                size="sm"
                className="bg-sky-600 text-white hover:bg-sky-700"
                onClick={() => setAddMemberOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Add New Member
              </Button>
            </>
          ) : null
        }
      />

      {canCore ? (
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search members (name, ID, mobile, email, staff)…"
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") goMembers(undefined, q, field);
            }}
          />
          <Select value={field} onChange={(e) => setField(e.target.value)} className="md:w-40">
            <option value="all">All</option>
            <option value="name">Name</option>
            <option value="mobile">Mobile</option>
            <option value="memberId">Member ID</option>
            <option value="email">Email</option>
            <option value="staff">Staff</option>
            <option value="plan">Plan</option>
            <option value="status">Status</option>
          </Select>
          <Button variant="outline" onClick={() => goMembers(undefined, q, field)}>
            <Search className="h-4 w-4" />
            Search
          </Button>
        </div>
      ) : null}

      {canCore ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {STATUS_TILES.map((tile) => (
            <button
              key={tile.key}
              type="button"
              onClick={() => goMembers(tile.key)}
              className={cn(
                "rounded-2xl border p-5 text-left shadow-sm transition hover:shadow-md",
                tile.tone,
              )}
            >
              <div className="text-sm font-medium">{tile.key}</div>
              <div className="mt-2 text-3xl font-bold tracking-tight">
                {statusCounts[tile.key] || 0}
              </div>
              <div className="mt-1 text-xs underline underline-offset-2">View {tile.key} members</div>
            </button>
          ))}

          {canRevenue ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              <div className="text-sm font-medium">Collected Revenue (This Month)</div>
              <div className="mt-2 text-3xl font-bold tracking-tight">
                {formatCurrency(collectedRevenue)}
              </div>
              <div className="mt-1 text-xs opacity-90">
                Payment received this month
                {growthRate >= 0 ? " · +" : " · "}
                {growthRate}% vs last month
                {prevMonthCollected != null
                  ? ` · Prev ${formatCurrency(prevMonthCollected)}`
                  : ""}
              </div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Profit (est.): {formatCurrency(profit)}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        {canTrend ? (
          <Card className="xl:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle>Revenue trend</CardTitle>
              <span
                className={cn(
                  "text-sm font-semibold",
                  growthRate >= 0 ? "text-emerald-600" : "text-rose-600",
                )}
              >
                Growth Rate {growthRate >= 0 ? "+" : ""}
                {growthRate}%
              </span>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0d9488" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#0d9488" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v || 0))} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#0d9488"
                    fill="url(#rev)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : null}

        {canPlans ? (
          <Card>
            <CardHeader>
              <CardTitle>Membership by Plan Type</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div
                  className="h-36 w-36 shrink-0 rounded-full border border-border"
                  style={{ background: planPie }}
                  aria-hidden
                />
                <div className="space-y-1.5 text-xs">
                  {planDistribution.map((p) => (
                    <div key={p.name} className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: p.color }}
                      />
                      <span className="text-foreground">{p.name}</span>
                      <span className="text-muted-foreground">
                        {p.count} · {p.pct}%
                      </span>
                    </div>
                  ))}
                  {!planDistribution.length ? (
                    <p className="text-muted-foreground">No plan data yet.</p>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        ) : canTrend ? (
          <Card>
            <CardHeader>
              <CardTitle>Recent payments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments yet.</p>
              ) : (
                payments.map((p, idx) => (
                  <div
                    key={`${p.memberId}-${idx}`}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{p.name || p.memberId}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(p.paidAt)} · {p.method || "—"}
                      </p>
                    </div>
                    <span className="font-semibold">{formatCurrency(p.amount)}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* Keep Recent payments even when plan chart is shown (user-requested). */}
      {canPlans ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent payments</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments yet.</p>
            ) : (
              payments.map((p, idx) => (
                <div
                  key={`${p.memberId}-${idx}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name || p.memberId}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(p.paidAt)} · {p.method || "—"}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold">{formatCurrency(p.amount)}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      {canOverdue ? (
        <Card>
          <CardHeader>
            <CardTitle>Overdue Payments and Retention Alerts</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="hidden min-w-full text-sm md:table">
                <thead>
                  <tr className="border-b border-border bg-teal-50/80 text-left text-xs text-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
                    <th className="px-4 py-3 font-medium">Member</th>
                    <th className="px-4 py-3 font-medium">ID</th>
                    <th className="px-4 py-3 font-medium">Overdue Plan</th>
                    <th className="px-4 py-3 font-medium">Overdue Amount</th>
                    <th className="px-4 py-3 font-medium">Overdue Since [Days]</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueList.slice(0, 10).map((m) => (
                    <OverdueRow
                      key={m.memberId}
                      m={m}
                      expanded={expandedOverdueId === m.memberId}
                      onToggle={() =>
                        setExpandedOverdueId((prev) => (prev === m.memberId ? "" : m.memberId))
                      }
                      onReminder={(member) => openWhatsAppPreview(member, "fine")}
                    />
                  ))}
                  {!overdueList.length ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        No overdue members. This list auto-updates when payment dates change.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>

              <div className="space-y-3 p-4 md:hidden">
                {overdueList.slice(0, 10).map((m) => (
                  <div key={m.memberId} className="rounded-xl border border-border p-3">
                    <div className="font-semibold">{m.name || m.memberId}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Plan: {m.plan || "—"} · Amount: {formatCurrency(Number(m.amount || 0))} ·{" "}
                      {m.overdueDays} days overdue
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!m.mobile}
                        onClick={() => openWhatsAppPreview(m, "fine")}
                      >
                        Reminder
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => goMembers(undefined, m.memberId, "memberId")}>
                        Open
                      </Button>
                    </div>
                  </div>
                ))}
                {!overdueList.length ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    No overdue members.
                  </p>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Expiring soon</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {expiring.slice(0, 8).map((m) => (
              <button
                key={m.memberId}
                type="button"
                className="flex w-full items-center justify-between rounded-xl px-1 py-1.5 text-left text-sm hover:bg-accent/50"
                onClick={() => goMembers(undefined, m.memberId, "memberId")}
              >
                <span>{m.name || m.memberId}</span>
                <Badge variant="warning">{formatDate(m.renewalDate)}</Badge>
              </button>
            ))}
            {!expiring.length ? (
              <p className="text-sm text-muted-foreground">No renewals due in the next 14 days.</p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Birthdays this month</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {birthdays.slice(0, 8).map((m) => (
              <button
                key={m.memberId}
                type="button"
                className="flex w-full items-center justify-between rounded-xl px-1 py-1.5 text-left text-sm hover:bg-accent/50"
                onClick={() => goMembers(undefined, m.memberId, "memberId")}
              >
                <span>{m.name || m.memberId}</span>
                <Badge variant="muted">{formatDate(m.dob)}</Badge>
              </button>
            ))}
            {!birthdays.length ? (
              <p className="text-sm text-muted-foreground">No birthdays this month.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {nothingEnabled ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No dashboard widgets are enabled for this staff profile.
          </CardContent>
        </Card>
      ) : null}

      {/* Live search preview when typing (prod searches on button; we also preview) */}
      {canCore && q.trim() ? (
        <Card>
          <CardHeader>
            <CardTitle>Search preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {members
              .filter((m) => matchesField(m, q, field))
              .slice(0, 8)
              .map((m) => (
                <button
                  key={m.memberId}
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl border border-border/70 px-3 py-2 text-left text-sm hover:bg-accent/50"
                  onClick={() => goMembers(undefined, m.memberId, "memberId")}
                >
                  <span>
                    {m.name || m.memberId}{" "}
                    <span className="text-xs text-muted-foreground">· {m.mobile || "—"}</span>
                  </span>
                  <Badge variant={m.status === "Active" ? "success" : "muted"}>
                    {m.status || "Active"}
                  </Badge>
                </button>
              ))}
          </CardContent>
        </Card>
      ) : null}

      <MessagePreviewModal
        preview={waPreview}
        sending={waSending}
        onClose={closeWhatsAppPreview}
        onSend={() => void confirmWhatsAppSend()}
      />
    </div>
  );
}
