"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AccentMetricCard } from "@/components/ui/accent-metric-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Skeleton } from "@/components/ui/misc";
import { useFinance, useFinanceYearSummary, useMembers, useVisitors } from "@/hooks/use-data";
import { isPaymentByPastDue, overdueDaysForMember } from "@/lib/domain/billing";
import {
  buildClientRevenueTrend,
  buildFinanceKpis,
  collectedTrendFromYearSummary,
} from "@/lib/domain/finance";
import {
  birthdaysThisMonth,
  countByStatus,
  expiringSoon,
} from "@/lib/domain/members";
import { analyticsApi } from "@/services/api";
import { STALE } from "@/lib/query-cache";
import { useAuthStore } from "@/stores";
import { cn, downloadTextFile, formatCurrency, formatDate, formatMonthKey, toCsv } from "@/lib/utils";

type TabId =
  | "overview"
  | "members"
  | "money"
  | "portal"
  | "operations"
  | "pt"
  | "website"
  | "growth";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "members", label: "Members" },
  { id: "money", label: "Money" },
  { id: "portal", label: "Portal" },
  { id: "operations", label: "Operations" },
  { id: "pt", label: "PT" },
  { id: "website", label: "Website" },
  { id: "growth", label: "Growth" },
];

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function SparseNote({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100">
      {message}
    </p>
  );
}

export function AnalyticsPage() {
  const [tab, setTab] = useState<TabId>("overview");
  const branchId = useAuthStore((s) =>
    String(s.user?.activeBranchId || s.user?.gymCodeId || ""),
  );
  const { data: members = [], isLoading: membersLoading } = useMembers();
  const { data: finance } = useFinance();
  const { data: yearSummary } = useFinanceYearSummary();
  const { data: visitors = [] } = useVisitors();

  /** Persist + longer stale so Analytics opens from cache instead of reloading every visit. */
  const analyticsQueryOpts = {
    staleTime: STALE.analytics,
    gcTime: 24 * 60 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    placeholderData: (prev: Record<string, unknown> | undefined) => prev,
  } as const;

  const overviewQ = useQuery({
    queryKey: ["analytics", "overview", branchId || "all"],
    queryFn: analyticsApi.overview,
    ...analyticsQueryOpts,
  });
  const portalQ = useQuery({
    queryKey: ["analytics", "portal", branchId || "all"],
    queryFn: analyticsApi.portal,
    enabled: tab === "portal" || tab === "overview",
    ...analyticsQueryOpts,
  });
  const opsQ = useQuery({
    queryKey: ["analytics", "operations", branchId || "all"],
    queryFn: analyticsApi.operations,
    enabled: tab === "operations",
    ...analyticsQueryOpts,
  });
  const ptQ = useQuery({
    queryKey: ["analytics", "pt", branchId || "all"],
    queryFn: analyticsApi.pt,
    enabled: tab === "pt",
    ...analyticsQueryOpts,
  });
  const websiteQ = useQuery({
    queryKey: ["analytics", "website", branchId || "all"],
    queryFn: analyticsApi.website,
    enabled: tab === "website",
    ...analyticsQueryOpts,
  });
  const growthQ = useQuery({
    queryKey: ["analytics", "growth", branchId || "all"],
    queryFn: analyticsApi.growth,
    enabled: tab === "growth",
    ...analyticsQueryOpts,
  });

  const status = useMemo(() => countByStatus(members), [members]);
  const expiring = useMemo(() => expiringSoon(members, 30), [members]);
  const birthdays = useMemo(() => birthdaysThisMonth(members), [members]);
  const overdue = useMemo(
    () =>
      members
        .filter((m) => String(m.status || "") === "Active" && isPaymentByPastDue(m))
        .map((m) => ({ ...m, overdueDays: overdueDaysForMember(m) }))
        .sort((a, b) => b.overdueDays - a.overdueDays),
    [members],
  );

  const financeKpis = useMemo(
    () => buildFinanceKpis(finance?.transactions || [], formatMonthKey(), {}),
    [finance],
  );
  const revenueTrend = useMemo(() => {
    const fromYear = collectedTrendFromYearSummary(yearSummary as { months?: Array<Record<string, unknown>> }, {
      maxMonths: 6,
      throughMonthKey: formatMonthKey(),
    });
    if (fromYear?.length) {
      return fromYear.map((s) => ({ label: s.label, value: s.revenue }));
    }
    return buildClientRevenueTrend(finance?.transactions || [], formatMonthKey(), 6).map((s) => ({
      label: s.label,
      value: s.revenue,
    }));
  }, [yearSummary, finance]);

  const joinsByMonth = useMemo(() => {
    const through = formatMonthKey();
    const allowed = new Set<string>();
    {
      const [y0, m0] = through.split("-").map(Number);
      let y = y0;
      let m = m0;
      for (let i = 0; i < 12; i += 1) {
        allowed.add(`${y}-${String(m).padStart(2, "0")}`);
        m -= 1;
        if (m < 1) {
          m = 12;
          y -= 1;
        }
      }
    }
    const map: Record<string, number> = {};
    for (const m of members) {
      // Display-only: ignore future / typo join months (e.g. 2044-07) so chart stays in real range.
      const raw = String(m.joiningDate || "").slice(0, 7);
      if (!allowed.has(raw)) continue;
      map[raw] = (map[raw] || 0) + 1;
    }
    return [...allowed]
      .sort((a, b) => a.localeCompare(b))
      .map((month) => ({ month, count: map[month] || 0 }));
  }, [members]);

  const planMix = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of members) {
      // Plan mix is Active-only so Hold/Deactivated/Cancelled do not inflate the chart.
      if (String(m.status || "").trim() !== "Active") continue;
      const plan = String(m.plan || "Unknown").trim() || "Unknown";
      map[plan] = (map[plan] || 0) + 1;
    }
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([plan, count]) => ({
        plan: plan.length > 28 ? `${plan.slice(0, 26)}…` : plan,
        planFull: plan,
        count,
      }));
  }, [members]);

  const overviewKpis = asRecord(overviewQ.data?.kpis);
  const portalData = asRecord(portalQ.data);
  const portalSummary = asRecord(portalData.summary);
  const portalFeatureUsage = Array.isArray(portalData.featureUsage)
    ? (portalData.featureUsage as Array<{ event?: string; count?: number }>)
    : [];
  const portalTopEvents = Array.isArray(portalData.topEvents)
    ? (portalData.topEvents as Array<{ event?: string; count?: number }>)
    : [];
  const ops = asRecord(opsQ.data);
  const pt = asRecord(ptQ.data);
  const web = asRecord(websiteQ.data);
  const growth = asRecord(growthQ.data);
  const opsStaffActions = asRecord(ops.staffActions);
  const opsByHour = Array.isArray(opsStaffActions.byHour)
    ? (opsStaffActions.byHour as Array<{ hour: number; count: number }>)
    : [];
  const opsTopActions = Array.isArray(opsStaffActions.topActions)
    ? (opsStaffActions.topActions as Array<{ action?: string; count?: number }>)
    : [];
  const ptTrainerLoad = Array.isArray(pt.trainerLoad)
    ? (pt.trainerLoad as Array<{ trainer?: string; count?: number }>)
    : [];
  const webFunnel = Array.isArray(web.funnel)
    ? (web.funnel as Array<{ status?: string; count?: number }>)
    : [];
  const webSources = Array.isArray(web.sources)
    ? (web.sources as Array<{ source?: string; count?: number }>)
    : [];
  const growthConversion = asRecord(growth.conversion);
  const growthFootfall = asRecord(growth.footfall);
  const growthSample = Array.isArray(growthConversion.sample)
    ? (growthConversion.sample as Array<{
        visitorId?: string;
        visitorName?: string;
        memberCode?: string;
        memberName?: string;
      }>)
    : [];
  const footfallByDay = Array.isArray(growthFootfall.byDay)
    ? (growthFootfall.byDay as Array<{ day: string; count: number }>)
    : [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Analytics"
        description="Read-only insights across Gym Manager, Website leads, and Member Portal. Does not change members, payments, or audit history."
        actions={
          <Button
            variant="outline"
            onClick={() =>
              downloadTextFile(
                "analytics-members.csv",
                toCsv(members as unknown as Record<string, unknown>[]),
              )
            }
          >
            Export members CSV
          </Button>
        }
      />

      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-border bg-muted/30 p-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-xl px-3 py-1.5 text-sm font-medium transition",
              tab === t.id
                ? "bg-slate-900 text-white shadow dark:bg-teal-400 dark:text-slate-950"
                : "text-muted-foreground hover:bg-background hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="space-y-4">
          {overviewQ.isLoading || membersLoading ? <Skeleton className="h-28 w-full" /> : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <AccentMetricCard
              tone="emerald"
              label="Active members"
              value={String(status.Active ?? num(overviewKpis.activeMembers))}
              hint="Live membership"
            />
            <AccentMetricCard
              tone="sky"
              label="Collected MTD"
              value={formatCurrency(num(overviewKpis.collectedMtd) || financeKpis.collectedRevenue)}
              hint="Cash collected this month"
            />
            <AccentMetricCard
              tone="rose"
              label="Overdue (Active)"
              value={String(overdue.length || num(overviewKpis.overdueActive))}
              hint="Past payment-by date"
            />
            <AccentMetricCard
              tone="fuchsia"
              label="Portal logins (7d)"
              value={String(num(overviewKpis.portalLogins7d))}
              hint="Member Portal audit events"
            />
            <AccentMetricCard
              tone="amber"
              label="Website leads (7d)"
              value={String(
                num(overviewKpis.websiteLeads7d) ||
                  visitors.filter((v) => {
                    const t = Date.parse(String(v.createdAt || ""));
                    return Number.isFinite(t) && Date.now() - t < 7 * 86400000;
                  }).length,
              )}
              hint="Visitors intake"
            />
            <AccentMetricCard
              tone="teal"
              label="Staff present today"
              value={String(num(overviewKpis.staffPresentToday))}
              hint="Attendance records"
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Status mix</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {Object.entries(status)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ") || "No members"}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "members" ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {(["Active", "Hold", "Deactivated", "Cancelled"] as const).map((s) => (
              <AccentMetricCard
                key={s}
                tone={
                  s === "Active"
                    ? "emerald"
                    : s === "Hold"
                      ? "amber"
                      : s === "Deactivated"
                        ? "rose"
                        : "slate"
                }
                label={s}
                value={String(status[s] || 0)}
              />
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Joins by month</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={joinsByMonth}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#0f766e" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Plan mix (top 10) — Active</CardTitle>
              </CardHeader>
              <CardContent className="h-72 overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={planMix}
                    layout="vertical"
                    margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis
                      type="category"
                      dataKey="plan"
                      width={120}
                      tick={{ fontSize: 10 }}
                      interval={0}
                    />
                    <Tooltip
                      formatter={(value) => [value, "Members"]}
                      labelFormatter={(_, payload) => {
                        const row = payload?.[0]?.payload as
                          | { planFull?: string; plan?: string }
                          | undefined;
                        return row?.planFull || row?.plan || "";
                      }}
                    />
                    <Bar dataKey="count" fill="#0369a1" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Expiring (30d)</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    downloadTextFile(
                      "expiring-30d.csv",
                      toCsv(expiring as unknown as Record<string, unknown>[]),
                    )
                  }
                >
                  CSV
                </Button>
              </CardHeader>
              <CardContent className="max-h-72 space-y-2 overflow-y-auto text-sm">
                {expiring.slice(0, 40).map((m) => (
                  <div key={m.memberId} className="flex justify-between gap-2">
                    <span className="truncate font-medium">{m.name || m.memberId}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {formatDate(m.renewalDate || m.paymentBy)}
                    </span>
                  </div>
                ))}
                {!expiring.length ? <p className="text-muted-foreground">None</p> : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Overdue Active</CardTitle>
              </CardHeader>
              <CardContent className="max-h-72 space-y-2 overflow-y-auto text-sm">
                {overdue.slice(0, 40).map((m) => (
                  <div key={m.memberId} className="flex justify-between gap-2">
                    <span className="truncate font-medium">{m.name || m.memberId}</span>
                    <span className="shrink-0 text-rose-600 dark:text-rose-300">
                      {m.overdueDays}d
                    </span>
                  </div>
                ))}
                {!overdue.length ? <p className="text-muted-foreground">None</p> : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Birthdays this month</CardTitle>
              </CardHeader>
              <CardContent className="max-h-72 space-y-2 overflow-y-auto text-sm">
                {birthdays.slice(0, 40).map((m) => (
                  <div key={m.memberId} className="flex justify-between gap-2">
                    <span className="truncate font-medium">{m.name || m.memberId}</span>
                    <span className="shrink-0 text-muted-foreground">{formatDate(m.dob)}</span>
                  </div>
                ))}
                {!birthdays.length ? <p className="text-muted-foreground">None</p> : null}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "money" ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AccentMetricCard
              tone="emerald"
              label="Collected revenue"
              value={formatCurrency(financeKpis.collectedRevenue)}
              hint="Matches Finance cash semantics"
            />
            <AccentMetricCard
              tone="sky"
              label="YTD collected"
              value={formatCurrency(financeKpis.ytdCollected)}
            />
            <AccentMetricCard
              tone="amber"
              label="Expenses"
              value={formatCurrency(financeKpis.expense)}
            />
            <AccentMetricCard
              tone="teal"
              label="Profit"
              value={formatCurrency(financeKpis.profit)}
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Collected revenue trend</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v) || 0)} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#0f766e"
                    fill="#14b8a6"
                    fillOpacity={0.25}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            Money figures reuse the same Finance KPI builders as Dashboard / Finance — Analytics never
            rewrites payment or ledger rows.
          </p>
        </div>
      ) : null}

      {tab === "portal" ? (
        <div className="space-y-4">
          {portalQ.isLoading ? <Skeleton className="h-24 w-full" /> : null}
          {portalData.sparse ? (
            <SparseNote message="Low portal event volume in the last 30 days — charts will enrich as members use the portal." />
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AccentMetricCard
              tone="fuchsia"
              label="Portal enabled %"
              value={`${num(portalSummary.enabledPct)}%`}
              hint={`${num(portalSummary.portalEnabled)} members`}
            />
            <AccentMetricCard
              tone="sky"
              label="Activated %"
              value={`${num(portalSummary.activationPct)}%`}
              hint={`${num(portalSummary.portalActivated)} activated`}
            />
            <AccentMetricCard
              tone="emerald"
              label="Approx DAU (7d)"
              value={String(num(portalSummary.dauApprox7d))}
            />
            <AccentMetricCard
              tone="teal"
              label="Approx MAU (30d)"
              value={String(num(portalSummary.mauApprox30d))}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Feature usage (30d)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {portalFeatureUsage.map((row) => (
                  <div key={row.event} className="flex justify-between gap-2">
                    <span className="font-mono text-xs">{row.event}</span>
                    <span className="font-semibold">{row.count || 0}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Top portal events (30d)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {portalTopEvents.map((row) => (
                  <div key={row.event} className="flex justify-between gap-2">
                    <span className="truncate font-mono text-xs">{row.event}</span>
                    <span className="font-semibold">{row.count || 0}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "operations" ? (
        <div className="space-y-4">
          {opsQ.isLoading ? <Skeleton className="h-24 w-full" /> : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AccentMetricCard
              tone="emerald"
              label="Staff present-ish (30d)"
              value={`${num(asRecord(ops.staff).presentPct)}%`}
              hint={`${num(asRecord(ops.staff).presentish30d)} / ${num(asRecord(ops.staff).rows30d)} rows`}
            />
            <AccentMetricCard
              tone="amber"
              label="Leave requests (30d)"
              value={String(num(asRecord(ops.leave).requests30d))}
              hint={`${num(asRecord(ops.leave).pending)} pending`}
            />
            <AccentMetricCard
              tone="sky"
              label="Staff actions (30d)"
              value={String(num(opsStaffActions.total30d))}
            />
            <AccentMetricCard
              tone="rose"
              label="Member check-ins (30d)"
              value={String(num(asRecord(ops.memberCheckins).count30d))}
              hint={
                asRecord(ops.memberCheckins).sparse
                  ? "Low data"
                  : `${num(asRecord(ops.memberCheckins).uniqueMembers30d)} members`
              }
            />
          </div>
          {asRecord(ops.memberCheckins).sparse ? (
            <SparseNote message="Member gym check-in footfall is sparse. Numbers unlock as QR check-in is used more." />
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Staff action peak hours</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={opsByHour}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Top staff actions</CardTitle>
              </CardHeader>
              <CardContent className="max-h-64 space-y-2 overflow-y-auto text-sm">
                {opsTopActions.map((row) => (
                  <div key={row.action} className="flex justify-between gap-2">
                    <span className="truncate font-mono text-xs">{row.action}</span>
                    <span className="font-semibold">{row.count || 0}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "pt" ? (
        <div className="space-y-4">
          {ptQ.isLoading ? <Skeleton className="h-24 w-full" /> : null}
          {pt.sparse ? (
            <SparseNote message="Few PT profiles found — PT charts enrich as clients are assigned." />
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AccentMetricCard
              tone="sky"
              label="PT profiles"
              value={String(num(asRecord(pt.summary).ptProfiles))}
            />
            <AccentMetricCard
              tone="teal"
              label="PT plan members"
              value={String(num(asRecord(pt.summary).ptPlanMembers))}
            />
            <AccentMetricCard
              tone="emerald"
              label="Scheduled focus days"
              value={String(num(asRecord(pt.summary).scheduledFocusDays))}
            />
            <AccentMetricCard
              tone="amber"
              label="Workout logs (30d)"
              value={String(num(asRecord(pt.summary).workoutLogsWithExercises30d))}
              hint={`${num(asRecord(pt.summary).workoutLogs30d)} total rows`}
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Trainer load</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {ptTrainerLoad.map((row) => (
                <div key={row.trainer} className="flex justify-between gap-2">
                  <span className="truncate font-medium">{row.trainer}</span>
                  <span className="font-semibold">{row.count || 0}</span>
                </div>
              ))}
              {!ptTrainerLoad.length ? (
                <p className="text-muted-foreground">No trainer assignments yet</p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "website" ? (
        <div className="space-y-4">
          {websiteQ.isLoading ? <Skeleton className="h-24 w-full" /> : null}
          {web.sparse ? <SparseNote message="Few website leads in the last 30 days." /> : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <AccentMetricCard
              tone="amber"
              label="Leads (30d)"
              value={String(num(asRecord(web.summary).leads30d))}
            />
            <AccentMetricCard
              tone="rose"
              label="Callback required"
              value={String(num(asRecord(web.summary).callbackRequired))}
            />
            <AccentMetricCard
              tone="sky"
              label="Ask Me threads (30d)"
              value={String(num(asRecord(web.summary).botThreads30d))}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Lead status funnel</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {webFunnel.map((row) => (
                  <div key={row.status} className="flex justify-between gap-2">
                    <span>{row.status}</span>
                    <span className="font-semibold">{row.count || 0}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Lead sources</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {webSources.map((row) => (
                  <div key={row.source} className="flex justify-between gap-2">
                    <span className="font-mono text-xs">{row.source}</span>
                    <span className="font-semibold">{row.count || 0}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "growth" ? (
        <div className="space-y-4">
          {growthQ.isLoading ? <Skeleton className="h-24 w-full" /> : null}
          <SparseNote message="Growth tab is read-only. Mobile match does not write conversion fields or change visitors/members." />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AccentMetricCard
              tone="amber"
              label="Visitors (90d)"
              value={String(num(growthConversion.visitors90d))}
            />
            <AccentMetricCard
              tone="emerald"
              label="Matched to member"
              value={String(num(growthConversion.matchedToMember))}
              hint="Last-10 mobile digits"
            />
            <AccentMetricCard
              tone="rose"
              label="Unmatched leads"
              value={String(num(growthConversion.unmatched))}
            />
            <AccentMetricCard
              tone="sky"
              label="Check-ins (90d)"
              value={String(num(growthFootfall.checkins90d))}
              hint={
                growthFootfall.sparse
                  ? "Low data"
                  : `${num(growthFootfall.uniqueMembers)} members`
              }
            />
          </div>
          {growthFootfall.message ? <SparseNote message={String(growthFootfall.message)} /> : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Sample lead → member matches</CardTitle>
              </CardHeader>
              <CardContent className="max-h-80 space-y-2 overflow-y-auto text-sm">
                {growthSample.map((row) => (
                  <div key={row.visitorId} className="rounded-lg border border-border/70 px-3 py-2">
                    <div className="font-medium">{row.visitorName || "Visitor"}</div>
                    <div className="text-xs text-muted-foreground">
                      → {row.memberName || "—"} ({row.memberCode || "—"})
                    </div>
                  </div>
                ))}
                {!growthSample.length ? (
                  <p className="text-muted-foreground">No mobile matches in range</p>
                ) : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Check-in footfall (last 30 days with data)</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={footfallByDay}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#0369a1"
                      fill="#38bdf8"
                      fillOpacity={0.25}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}
