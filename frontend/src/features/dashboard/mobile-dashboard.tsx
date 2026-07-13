"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { AccentMetricCard } from "@/components/ui/accent-metric-card";
import { Skeleton } from "@/components/ui/misc";
import { MobileHero, MobilePanel } from "@/components/layout/mobile-ui";
import { useFinance, useMembers, useSettings } from "@/hooks/use-data";
import { buildFinanceKpis } from "@/lib/domain/finance";
import { countByStatus } from "@/lib/domain/members";
import { isPaymentByPastDue, overdueDaysForMember } from "@/lib/domain/billing";
import { formatCurrency, formatMonthKey } from "@/lib/utils";
import { hasAccess } from "@/lib/domain/permissions";
import { useAuthStore } from "@/stores";
import { MemberAvatar } from "@/components/member-avatar";

export function MobileDashboard() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const month = formatMonthKey(new Date());
  const { data: members = [], isLoading: loadingMembers } = useMembers();
  const { data: finance, isLoading: loadingFinance } = useFinance(month);
  const { data: settings } = useSettings();

  const canCore = hasAccess(user, "dashboard", "viewDashboardCore");
  const canRevenue = hasAccess(user, "dashboard", "viewRevenueMonthly");
  const canOverdue = hasAccess(user, "dashboard", "viewOverdueRetentionAlerts");

  const summary = (finance?.summary || {}) as {
    collectedRevenue?: number;
    revenueGrowthPct?: number;
    profit?: number;
  };
  const kpis = useMemo(
    () =>
      buildFinanceKpis(finance?.transactions || [], month, {
        financeUseEstimatedExpense: settings?.financeUseEstimatedExpense !== false,
      }),
    [finance?.transactions, month, settings?.financeUseEstimatedExpense],
  );
  const collectedRevenue =
    summary.collectedRevenue != null ? Number(summary.collectedRevenue) : kpis.collectedRevenue;
  const growthRate =
    summary.revenueGrowthPct != null ? Number(summary.revenueGrowthPct) : kpis.revenueGrowthPct;
  const profit = summary.profit != null ? Number(summary.profit) : kpis.profit;

  const statusCounts = useMemo(() => countByStatus(members), [members]);
  const overdue = useMemo(
    () =>
      members
        .filter((m) => isPaymentByPastDue(m))
        .map((m) => ({ ...m, days: overdueDaysForMember(m) }))
        .sort((a, b) => b.days - a.days)
        .slice(0, 6),
    [members],
  );

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (loadingMembers || loadingFinance) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-48" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <MobileHero
        eyebrow={greeting}
        title={user?.name?.split(" ")[0] || "Welcome"}
        subtitle="A calm view of what needs attention today."
      />

      {canCore ? (
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["Active", "emerald"],
              ["Hold", "amber"],
              ["Deactivated", "rose"],
              ["Cancelled", "slate"],
            ] as const
          ).map(([key, tone]) => (
            <AccentMetricCard
              key={key}
              label={key}
              value={statusCounts[key] || 0}
              tone={tone}
              onClick={() => router.push(`/members?status=${encodeURIComponent(key)}`)}
              className="!rounded-[1.25rem]"
            />
          ))}
        </div>
      ) : null}

      {canRevenue ? (
        <AccentMetricCard
          label="Collected this month"
          tag="Revenue"
          value={formatCurrency(collectedRevenue)}
          tone="teal"
          hint={`${growthRate >= 0 ? "+" : ""}${growthRate}% vs last month · Profit est. ${formatCurrency(profit)}`}
        />
      ) : null}

      {canOverdue ? (
        <MobilePanel accent="bg-rose-500">
          <div className="flex items-center justify-between px-4 pt-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-700/80 dark:text-rose-300/80">
                Attention
              </p>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">
                Overdue payments
              </h2>
            </div>
            <button
              type="button"
              className="text-xs font-semibold text-teal-700 dark:text-teal-300"
              onClick={() => router.push("/members?status=Active")}
            >
              View all
            </button>
          </div>
          <ul className="divide-y divide-black/5 dark:divide-white/5">
            {overdue.length === 0 ? (
              <li className="px-4 py-6 text-sm text-slate-500">All clear — no overdue members.</li>
            ) : (
              overdue.map((m) => (
                <li key={m.memberId}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
                    onClick={() => router.push("/members")}
                  >
                    <MemberAvatar member={m} className="h-10 w-10" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                        {m.name}
                      </p>
                      <p className="text-xs text-rose-600 dark:text-rose-400">
                        Overdue {m.days} day{m.days === 1 ? "" : "s"}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </button>
                </li>
              ))
            )}
          </ul>
        </MobilePanel>
      ) : null}
    </div>
  );
}
