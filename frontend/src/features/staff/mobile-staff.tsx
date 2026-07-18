"use client";

import { useMemo, useState } from "react";
import { MobileHero, MobilePanel } from "@/components/layout/mobile-ui";
import { StaffAvatar } from "@/components/staff-avatar";
import { Skeleton, Badge } from "@/components/ui/misc";
import { useGymCodes, useUsers } from "@/hooks/use-data";
import { useStaffPhotoHydration } from "@/hooks/use-staff-photo-hydration";
import { isBranchAdminUser } from "@/lib/domain/permissions";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores";

function gymLabel(code: { code?: string; name?: string; label?: string; id?: string }) {
  return code.code
    ? `${code.code}${code.name || code.label ? ` / ${code.name || code.label}` : ""}`
    : code.name || code.label || code.id || "—";
}

export function MobileStaff() {
  const user = useAuthStore((s) => s.user);
  const { data: users = [], isLoading } = useUsers();
  const { data: gymCodes = [] } = useGymCodes();
  useStaffPhotoHydration(users);
  const canManage = isBranchAdminUser(user);
  const [showDeletedStaff, setShowDeletedStaff] = useState(false);

  const deletedStaffCount = useMemo(
    () => users.filter((u) => Boolean(u.blocked)).length,
    [users],
  );

  const staff = useMemo(() => {
    const list = showDeletedStaff ? users : users.filter((u) => !u.blocked);
    return [...list].sort((a, b) =>
      String(a.name || a.id).localeCompare(String(b.name || b.id)),
    );
  }, [users, showDeletedStaff]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-48" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MobileHero
        eyebrow="Team"
        title="Staff"
        subtitle={
          canManage
            ? `${staff.length} people · edit roles on desktop for full access controls`
            : `${staff.length} people on this branch`
        }
      />

      {deletedStaffCount > 0 || showDeletedStaff ? (
        <button
          type="button"
          role="switch"
          aria-checked={showDeletedStaff}
          aria-label="Show deleted staff"
          onClick={() => setShowDeletedStaff((v) => !v)}
          className={cn(
            "inline-flex h-9 w-full items-center justify-between gap-2 rounded-xl border px-3 text-xs font-medium",
            showDeletedStaff
              ? "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
              : "border-slate-200 bg-white text-slate-600 dark:border-border dark:bg-background dark:text-slate-300",
          )}
        >
          <span>
            Show deleted staff
            {deletedStaffCount > 0 ? ` (${deletedStaffCount})` : ""}
          </span>
          <span
            className={cn(
              "relative h-5 w-9 shrink-0 rounded-full transition-colors",
              showDeletedStaff ? "bg-rose-500" : "bg-slate-300 dark:bg-slate-600",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                showDeletedStaff && "translate-x-4",
              )}
            />
          </span>
        </button>
      ) : null}

      <div className="space-y-2.5">
        {staff.map((u) => {
          const branch = gymCodes.find(
            (g) => String(g.id) === String(u.gymCodeId || u.homeBranchId || ""),
          );
          return (
            <MobilePanel key={u.id} className="px-3.5 py-3">
              <div className="flex items-center gap-3">
                <StaffAvatar user={u} className="h-12 w-12 text-xs" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                      {u.name || u.id}
                    </p>
                    {u.blocked ? <Badge variant="danger">Blocked</Badge> : null}
                  </div>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {u.staffRole || u.role || "staff"}
                    {u.email ? ` · ${u.email}` : ""}
                  </p>
                  <p className="truncate text-[11px] text-slate-400">
                    {branch ? gymLabel(branch) : u.gymCodeId || "—"}
                  </p>
                </div>
              </div>
              {(u.sections || []).length ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {(u.sections || []).slice(0, 6).map((s) => (
                    <span
                      key={s}
                      className="rounded-md bg-slate-900/5 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-white/5 dark:text-slate-300"
                    >
                      {s}
                    </span>
                  ))}
                  {(u.sections || []).length > 6 ? (
                    <span className="text-[10px] text-slate-400">
                      +{(u.sections || []).length - 6}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </MobilePanel>
          );
        })}
      </div>
    </div>
  );
}
