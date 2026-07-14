"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { ChevronDown, Phone, Search, X } from "lucide-react";
import { MobileChip, MobileHero, MobilePanel } from "@/components/layout/mobile-ui";
import { MemberAvatar } from "@/components/member-avatar";
import { Skeleton } from "@/components/ui/misc";
import { Input } from "@/components/ui/input";
import { useGymCodes, useMembers, useSettings } from "@/hooks/use-data";
import { EditMemberModal } from "@/features/members/edit-member-modal";
import { memberSearchHaystack } from "@/lib/domain/members";
import { isPaymentByPastDue, overdueDaysForMember, paymentByDateKey, inactiveDurationLabel } from "@/lib/domain/billing";
import { formatDate, cn } from "@/lib/utils";
import { hasAccess } from "@/lib/domain/permissions";
import { useAuthStore, useUiStore } from "@/stores";
import { useMobileFeatureAccess } from "@/components/layout/mobile-access-guard";
import type { Member } from "@/types";

const STATUS_FILTERS = ["All", "Active", "Hold", "Deactivated", "Cancelled"] as const;

function publicSearchHaystack(m: Member) {
  return [m.name, m.memberId, m.plan, m.status].filter(Boolean).join(" ").toLowerCase();
}

export function MobileMembers() {
  const user = useAuthStore((s) => s.user);
  const setAddMemberOpen = useUiStore((s) => s.setAddMemberOpen);
  const qc = useQueryClient();
  const params = useSearchParams();
  const { data: members = [], isLoading } = useMembers();
  const { data: settings } = useSettings();
  const { data: gymCodes = [] } = useGymCodes();
  const [q, setQ] = useState(params.get("q") || "");
  const initialStatus = params.get("status");
  const [status, setStatus] = useState<string>(
    initialStatus && STATUS_FILTERS.includes(initialStatus as (typeof STATUS_FILTERS)[number])
      ? initialStatus
      : "All",
  );
  const [editing, setEditing] = useState<Member | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const mobile = useMobileFeatureAccess();

  useEffect(() => {
    const s = params.get("status");
    if (s && STATUS_FILTERS.includes(s as (typeof STATUS_FILTERS)[number])) setStatus(s);
  }, [params]);

  const canEdit = hasAccess(user, "members", "editMembers") && mobile.membersEdit;
  const canAdd = hasAccess(user, "members", "addMembers") && mobile.membersAdd;
  const canExpand = mobile.membersExpand;

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return members
      .filter((m) => {
        if (status !== "All" && (m.status || "Active") !== status) return false;
        if (!query) return true;
        const hay = canExpand ? memberSearchHaystack(m) : publicSearchHaystack(m);
        return hay.includes(query);
      })
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
      .slice(0, 80);
  }, [members, q, status, canExpand]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-56" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MobileHero
        eyebrow="Members"
        title="Your roster"
        subtitle={
          canExpand
            ? `${members.length} total · tap a card to show contact`
            : `${members.length} total · contact details hidden`
        }
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={canExpand ? "Search name, ID, phone…" : "Search name or ID…"}
          className={cn(
            "h-12 rounded-2xl border-black/5 bg-white/80 pl-10 shadow-sm dark:border-white/8 dark:bg-white/[0.04]",
            q.trim() ? "pr-11" : "pr-4",
          )}
        />
        {q.trim() ? (
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
            onClick={() => setQ("")}
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {STATUS_FILTERS.map((s) => (
          <MobileChip key={s} active={status === s} onClick={() => setStatus(s)}>
            {s}
          </MobileChip>
        ))}
      </div>

      {canAdd ? (
        <button
          type="button"
          onClick={() => setAddMemberOpen(true)}
          className="w-full rounded-2xl border border-dashed border-slate-300/80 bg-white/50 py-3 text-sm font-semibold text-slate-700 dark:border-white/15 dark:bg-white/[0.03] dark:text-slate-200"
        >
          + Add member
        </button>
      ) : null}

      <div className="space-y-2.5">
        {filtered.length === 0 ? (
          <MobilePanel>
            <p className="px-4 py-8 text-center text-sm text-slate-500">No members match.</p>
          </MobilePanel>
        ) : (
          filtered.map((m) => {
            const overdue = isPaymentByPastDue(m);
            const inactive = inactiveDurationLabel(m);
            const payBy = paymentByDateKey(m);
            const rowKey = String(m.memberId || m.id || "");
            const isExpanded = canExpand && expandedId === rowKey;
            return (
              <article
                key={rowKey}
                className={cn(
                  "rounded-[1.25rem] border shadow-sm transition",
                  overdue
                    ? "border-rose-200/80 bg-rose-50/70 dark:border-rose-500/20 dark:bg-rose-950/25"
                    : "border-black/5 bg-white/85 dark:border-white/8 dark:bg-white/[0.04]",
                  isExpanded && "ring-1 ring-slate-300/70 dark:ring-teal-500/35",
                )}
              >
                <button
                  type="button"
                  disabled={!canExpand}
                  onClick={() => {
                    if (!canExpand) return;
                    setExpandedId((prev) => (prev === rowKey ? null : rowKey));
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 px-3.5 py-3 text-left",
                    canExpand && "active:scale-[0.99]",
                    !canExpand && "cursor-default",
                  )}
                  aria-expanded={canExpand ? isExpanded : undefined}
                  aria-label={
                    canExpand
                      ? isExpanded
                        ? `Collapse ${m.name || "member"}`
                        : `Expand ${m.name || "member"} to show contact details`
                      : undefined
                  }
                >
                  <MemberAvatar member={m} className="h-12 w-12" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                        {m.name || "—"}
                      </p>
                      <span
                        className={cn(
                          "shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                          m.status === "Active" &&
                            "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                          m.status === "Hold" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                          m.status === "Deactivated" &&
                            "bg-rose-500/15 text-rose-700 dark:text-rose-300",
                          (!m.status || m.status === "Cancelled") &&
                            "bg-slate-500/15 text-slate-600 dark:text-slate-300",
                        )}
                      >
                        {m.status || "Active"}
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {m.memberId} · {m.plan || "No plan"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      Pay by {formatDate(payBy || m.billingDate) || "—"}
                      {overdue ? (
                        <span className="font-semibold text-rose-600 dark:text-rose-400">
                          {" "}
                          · {overdueDaysForMember(m)}d overdue
                        </span>
                      ) : null}
                      {inactive ? (
                        <span
                          className={cn(
                            "block font-semibold",
                            m.status === "Hold" && "text-amber-700 dark:text-amber-300",
                            m.status === "Deactivated" && "text-rose-700 dark:text-rose-300",
                          )}
                        >
                          {inactive}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  {canExpand ? (
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-slate-400 transition-transform",
                        isExpanded && "rotate-180",
                      )}
                      aria-hidden
                    />
                  ) : null}
                </button>

                {isExpanded ? (
                  <div className="space-y-2.5 border-t border-black/5 px-3.5 pb-3.5 pt-3 dark:border-white/8">
                    <div className="flex items-center gap-2 text-[13px] text-slate-800 dark:text-slate-100">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="font-medium tabular-nums">
                        {m.mobile || "No mobile on file"}
                      </span>
                    </div>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => setEditing(m)}
                        className="w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white dark:bg-teal-600"
                      >
                        Edit member
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>

      {editing ? (
        <EditMemberModal
          key={editing.memberId}
          member={editing}
          members={members}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await qc.invalidateQueries({ queryKey: ["members"] });
          }}
          settings={settings}
          gymCodes={gymCodes}
          currentUser={user}
          planOptions={settings?.plans}
          statusOptions={settings?.statuses || ["Active", "Hold", "Deactivated", "Cancelled"]}
          holdOptions={settings?.holdDurations}
          paymentOptions={settings?.paymentMethods}
        />
      ) : null}
    </div>
  );
}
