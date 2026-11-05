"use client";

import { useMemo, useState } from "react";
import { birthdaysToday, expiringSoon } from "@/lib/domain/members";
import { isPaymentByPastDue, localCalendarDateKey, localTodayCalendarKey } from "@/lib/domain/billing";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import type { Member, Visitor } from "@/types";

type ChipKey = "due" | "overdue" | "renewing" | "visitors" | "birthdays";

export function membersDueToday(members: Member[], todayKey = localTodayCalendarKey()) {
  return members.filter(
    (member) =>
      member.status === "Active" && localCalendarDateKey(member.billingDate) === todayKey,
  );
}

export function visitorsStillWaiting(visitors: Visitor[]) {
  return visitors.filter((visitor) => String(visitor.status || "") !== "Converted");
}

export function hiddenNamesClass(hidden: boolean) {
  return hidden ? "pointer-events-none select-none blur-md" : "";
}

type Props = {
  members: Member[];
  visitors: Visitor[];
  canMembers: boolean;
  canOverdue: boolean;
  canVisitors: boolean;
  namesHidden: boolean;
  onOpenMember: (memberId: string) => void;
  onOpenVisitors: () => void;
  onOpenOverdue: () => void;
};

export function DashboardTodayRow({
  members,
  visitors,
  canMembers,
  canOverdue,
  canVisitors,
  namesHidden,
  onOpenMember,
  onOpenVisitors,
  onOpenOverdue,
}: Props) {
  const [openKey, setOpenKey] = useState<ChipKey | "">("");
  const due = useMemo(() => membersDueToday(members), [members]);
  const renewing = useMemo(() => expiringSoon(members, 7), [members]);
  const birthdays = useMemo(() => birthdaysToday(members), [members]);
  const waiting = useMemo(() => visitorsStillWaiting(visitors), [visitors]);
  const overdue = useMemo(
    () => members.filter((member) => isPaymentByPastDue(member)),
    [members],
  );
  const overdueAmount = overdue.reduce((sum, member) => sum + Number(member.amount || 0), 0);

  const chips: Array<{ key: ChipKey; label: string; value: string; show: boolean }> = [
    { key: "due", label: "Due today", value: String(due.length), show: canMembers },
    {
      key: "overdue",
      label: "Overdue",
      value: overdue.length ? `${overdue.length} · ${formatCurrency(overdueAmount)}` : "0",
      show: canOverdue,
    },
    { key: "renewing", label: "Renewing in 7 days", value: String(renewing.length), show: canMembers },
    { key: "visitors", label: "Visitors waiting", value: String(waiting.length), show: canVisitors },
    { key: "birthdays", label: "Birthdays today", value: String(birthdays.length), show: canMembers },
  ];
  const visible = chips.filter((chip) => chip.show);
  if (!visible.length) return null;

  const choose = (key: ChipKey) => {
    if (key === "overdue") {
      setOpenKey("");
      onOpenOverdue();
      return;
    }
    if (key === "visitors") {
      setOpenKey("");
      onOpenVisitors();
      return;
    }
    setOpenKey((current) => (current === key ? "" : key));
  };

  const detail =
    openKey === "due"
      ? due.map((member) => ({
          id: member.memberId,
          name: member.name || member.memberId,
          meta: formatDate(member.billingDate),
        }))
      : openKey === "renewing"
        ? renewing.map((member) => ({
            id: member.memberId,
            name: member.name || member.memberId,
            meta: formatDate(member.renewalDate),
          }))
        : openKey === "birthdays"
          ? birthdays.map((member) => ({
              id: member.memberId,
              name: member.name || member.memberId,
              meta: formatDate(member.dob),
            }))
          : [];

  return (
    <section className="space-y-3" aria-label="Today">
      <h2 className="text-sm font-semibold tracking-tight">Today</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {visible.map((chip) => (
          <button
            key={chip.key}
            type="button"
            aria-pressed={openKey === chip.key}
            className={cn(
              "min-w-0 rounded-2xl border px-3 py-2 text-left transition",
              openKey === chip.key
                ? "border-teal-600 bg-teal-50 dark:border-teal-400 dark:bg-teal-950/40"
                : "border-border bg-card hover:bg-accent/40",
            )}
            onClick={() => choose(chip.key)}
          >
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {chip.label}
            </p>
            <p className="mt-1 truncate text-base font-semibold tabular-nums">{chip.value}</p>
          </button>
        ))}
      </div>
      {detail.length || (openKey && openKey !== "overdue" && openKey !== "visitors") ? (
        <div className={cn("rounded-2xl border border-border bg-card", hiddenNamesClass(namesHidden))}>
          {detail.length ? (
            <ul className="divide-y divide-border">
              {detail.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent/40"
                    onClick={() => onOpenMember(row.id)}
                  >
                    <span className="truncate font-medium">{row.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{row.meta}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-3 text-sm text-muted-foreground">No one in this list.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
