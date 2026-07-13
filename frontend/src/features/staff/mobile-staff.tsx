"use client";

import { useMemo } from "react";
import { MobileHero, MobilePanel } from "@/components/layout/mobile-ui";
import { StaffAvatar } from "@/components/staff-avatar";
import { Skeleton, Badge } from "@/components/ui/misc";
import { useGymCodes, useUsers } from "@/hooks/use-data";
import { useStaffPhotoHydration } from "@/hooks/use-staff-photo-hydration";
import { isBranchAdminUser } from "@/lib/domain/permissions";
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

  const staff = useMemo(
    () => [...users].sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id))),
    [users],
  );

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
