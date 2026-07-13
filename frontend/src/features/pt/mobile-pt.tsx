"use client";

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { MobileHero, MobilePanel } from "@/components/layout/mobile-ui";
import { MemberAvatar } from "@/components/member-avatar";
import { Skeleton } from "@/components/ui/misc";
import { useMembers, useSettings } from "@/hooks/use-data";
import { isPtEligibleMember } from "@/lib/domain/pt-eligibility";
import { normalizeAccess } from "@/lib/domain/permissions";
import { formatDate, cn } from "@/lib/utils";
import { useAuthStore } from "@/stores";
import type { PtClientProfile } from "@/types/pt";
import type { Member } from "@/types";

/** Upmarket mobile PT roster — opens desktop coaching tools in an in-page sheet. */
export function MobilePt() {
  const user = useAuthStore((s) => s.user);
  const { data: members = [], isLoading: membersLoading } = useMembers();
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const access = normalizeAccess(user?.access);
  const canView = access.ptClients?.viewPtClients !== false;

  const profilesMap = (settings?.ptClientProfiles || {}) as Record<string, PtClientProfile>;
  const ptMembers = useMemo(() => members.filter((m) => isPtEligibleMember(m)), [members]);
  const [selected, setSelected] = useState<Member | null>(null);

  if (membersLoading || settingsLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-48" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!canView) {
    return (
      <MobilePanel>
        <p className="px-4 py-8 text-center text-sm text-slate-500">No PT access on this account.</p>
      </MobilePanel>
    );
  }

  return (
    <div className="space-y-4">
      <MobileHero
        eyebrow="Training"
        title="PT Clients"
        subtitle={`${ptMembers.length} athletes · tap for coaching snapshot`}
      />

      {ptMembers.length === 0 ? (
        <MobilePanel>
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            No PT clients yet. Assign a PT plan from Members.
          </p>
        </MobilePanel>
      ) : (
        <div className="space-y-2.5">
          {ptMembers.map((m) => {
            const profile = profilesMap[m.memberId] || {};
            const trainer = String(profile.trainerId || m.staff || m.trainerId || "Unassigned");
            return (
              <button
                key={m.memberId}
                type="button"
                onClick={() => setSelected(m)}
                className="flex w-full items-center gap-3 rounded-[1.25rem] border border-black/5 bg-white/85 px-3.5 py-3 text-left shadow-sm transition active:scale-[0.99] dark:border-white/8 dark:bg-white/[0.04]"
              >
                <MemberAvatar member={m} className="h-12 w-12" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                    {m.name}
                  </p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {m.plan || "PT"} · Coach {trainer}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Billing {formatDate(m.billingDate) || "—"}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            );
          })}
        </div>
      )}

      {selected ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/45 p-0 backdrop-blur-[2px]">
          <button
            type="button"
            className="flex-1"
            aria-label="Close"
            onClick={() => setSelected(null)}
          />
          <div className="max-h-[78vh] overflow-y-auto rounded-t-[1.75rem] border border-black/5 bg-[#f7f5f1] p-5 shadow-2xl dark:border-white/10 dark:bg-[#0c121c]">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
            <div className="mb-4 flex items-center gap-3">
              <MemberAvatar member={selected} className="h-14 w-14" />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold tracking-tight">{selected.name}</p>
                <p className="text-xs text-slate-500">
                  {selected.memberId} · {selected.plan || "PT"}
                </p>
              </div>
            </div>
            <MobilePanel accent="bg-teal-500" className="mb-3">
              <div className="space-y-2 p-4 text-sm">
                <Row label="Billing" value={formatDate(selected.billingDate) || "—"} />
                <Row
                  label="Trainer"
                  value={String(
                    profilesMap[selected.memberId]?.trainerId ||
                      selected.staff ||
                      selected.trainerId ||
                      "—",
                  )}
                />
                <Row
                  label="Sessions logged"
                  value={String(
                    (profilesMap[selected.memberId]?.sessions || []).length || 0,
                  )}
                />
                <Row
                  label="Weight logs"
                  value={String(
                    (profilesMap[selected.memberId]?.weightLogs || []).length || 0,
                  )}
                />
              </div>
            </MobilePanel>
            <p className="mb-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Full workout, diet, and session tools stay on the desktop PT desk for accuracy.
              This mobile sheet is your quick client snapshot on the floor.
            </p>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className={cn(
                "w-full rounded-2xl bg-slate-900 py-3.5 text-sm font-semibold text-white dark:bg-teal-400 dark:text-slate-950",
              )}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="truncate font-medium text-slate-900 dark:text-slate-50">{value}</span>
    </div>
  );
}
