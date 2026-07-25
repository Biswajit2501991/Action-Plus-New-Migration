"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MobileChip, MobileHero, MobilePanel } from "@/components/layout/mobile-ui";
import { Badge, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useSettings, useUsers } from "@/hooks/use-data";
import { leaveApi } from "@/services/api";
import { formatDate, cn } from "@/lib/utils";
import { hasAccess } from "@/lib/domain/permissions";
import { localTodayCalendarKey } from "@/lib/domain/billing";
import {
  LEAVE_TYPES,
  annualLeaveBalanceRemaining,
  buildStaffLoginAliasMap,
  canReviewAllLeave,
  filterLeaveRequestsForViewer,
  leaveDaysBetween,
  leaveRequestMatchesStaff,
  leaveStatusBadgeVariant,
  leaveSubmitErrorMessage,
  normalizeLeaveRequest,
  normalizeLeaveStatus,
  staffDisplayName,
} from "@/lib/domain/leave";
import { useAuthStore } from "@/stores";
import { useMobileFeatureAccess } from "@/components/layout/mobile-access-guard";
import { ApiError } from "@/services/api/client";
import type { LeaveRequest } from "@/types";

export function MobileLeave() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const mobile = useMobileFeatureAccess();

  const canCreate =
    hasAccess(user, "leave", "viewCreateLeaveRequest") && mobile.leaveCreate;
  const canViewRequests = hasAccess(user, "leave", "viewLeaveRequests");
  const { data: settings, isLoading } = useSettings(undefined, {
    refetchInterval: canViewRequests ? 12_000 : false,
  });
  const { data: users = [] } = useUsers();
  const isOwnerView = canReviewAllLeave(user);
  const canApprove = isOwnerView && canViewRequests && mobile.leaveApprove;
  const viewerId = String(user?.id || "").trim();
  const calendarYear = new Date().getFullYear();

  const staff = useMemo(() => (users || []).filter((u) => !u.blocked), [users]);
  const aliasMap = useMemo(() => buildStaffLoginAliasMap(staff), [staff]);
  const today = localTodayCalendarKey();
  const [tab, setTab] = useState<"requests" | "create" | "balance" | "history">("requests");
  const [form, setForm] = useState({
    userId: "",
    type: "Casual",
    startDate: today,
    endDate: today,
    reason: "",
  });

  const leaveRequests = useMemo(
    () =>
      filterLeaveRequestsForViewer(
        ((settings?.leaveRequests || []) as LeaveRequest[]).map((r) => normalizeLeaveRequest(r)),
        viewerId,
        { reviewAll: isOwnerView, aliasMap },
      ).sort((a, b) =>
        String(b.startDate || b.fromDate || "").localeCompare(
          String(a.startDate || a.fromDate || ""),
        ),
      ),
    [settings?.leaveRequests, viewerId, isOwnerView, aliasMap],
  );

  const visible = useMemo(() => leaveRequests.slice(0, 40), [leaveRequests]);

  const historyRows = useMemo(() => {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 2);
    return leaveRequests
      .filter((r) => normalizeLeaveStatus(r.status) === "Approved")
      .filter((r) => {
        const start = r.startDate || r.fromDate || "";
        if (!start) return false;
        const d = new Date(start);
        return !Number.isNaN(d.getTime()) && d >= cutoff;
      })
      .slice(0, 40);
  }, [leaveRequests]);

  const { data: balanceData, isLoading: balanceLoading } = useQuery({
    queryKey: ["leave-balance", calendarYear, viewerId, isOwnerView ? "all" : "self"],
    queryFn: () => leaveApi.balances(calendarYear),
    enabled: Boolean(user),
  });

  const myBalance = useMemo(() => {
    const apiRows = Array.isArray(balanceData?.rows) ? balanceData.rows : [];
    const match = apiRows.find((row) =>
      leaveRequestMatchesStaff(
        String((row as { userId?: string }).userId || row.staffLoginId || ""),
        viewerId,
        aliasMap,
      ),
    );
    if (match) {
      return Number(
        (match as { balance?: number; remainingDays?: number }).balance ??
          match.remainingDays ??
          0,
      );
    }
    return annualLeaveBalanceRemaining(leaveRequests, viewerId, {
      year: calendarYear,
      baseDays: Number(balanceData?.baseDays ?? 24),
      aliasMap,
      adjustments: (balanceData?.adjustments || []) as never,
    });
  }, [balanceData, leaveRequests, viewerId, aliasMap, calendarYear]);

  const createMut = useMutation({
    mutationFn: async () => {
      const userId = isOwnerView ? form.userId || user?.id || "" : viewerId;
      if (!userId) throw new Error("Select staff");
      if (!form.startDate || !form.endDate) throw new Error("Choose dates");
      return leaveApi.create({
        userId,
        staffId: userId,
        type: form.type,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason.trim(),
        days: leaveDaysBetween(form.startDate, form.endDate),
      });
    },
    onSuccess: async () => {
      toast.success("Leave request submitted");
      setForm((f) => ({ ...f, reason: "", startDate: today, endDate: today }));
      setTab("requests");
      await qc.invalidateQueries({ queryKey: ["settings"] });
      await qc.invalidateQueries({ queryKey: ["leave-balance"] });
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        toast.error(
          leaveSubmitErrorMessage({
            message: err.message,
            status: err.status,
            code: err.code,
          }),
        );
        return;
      }
      toast.error(err instanceof Error ? err.message : "Could not submit leave");
    },
  });

  const decideMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      leaveApi.update(id, { status }),
    onSuccess: async () => {
      toast.success("Updated");
      await qc.invalidateQueries({ queryKey: ["settings"] });
      await qc.invalidateQueries({ queryKey: ["leave-balance"] });
    },
    onError: () => toast.error("Could not update leave"),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-48" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MobileHero
        eyebrow="Time off"
        title="Leave"
        subtitle={
          isOwnerView
            ? "Request and review leave without the desktop clutter."
            : "Your requests, balance, and history only."
        }
      />

      <MobilePanel className="grid grid-cols-2 gap-2 p-3">
        <div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.04]">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Requests
          </p>
          <p className="text-lg font-semibold tabular-nums">{leaveRequests.length}</p>
        </div>
        <div className="rounded-xl bg-violet-50 px-3 py-2 dark:bg-violet-950/30">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-400">
            Balance · {calendarYear}
          </p>
          <p className="text-lg font-semibold tabular-nums text-violet-800 dark:text-violet-300">
            {balanceLoading ? "…" : myBalance}
            <span className="ml-1 text-xs font-medium text-violet-500">days</span>
          </p>
        </div>
      </MobilePanel>

      <div className="flex flex-wrap gap-2">
        <MobileChip active={tab === "requests"} onClick={() => setTab("requests")}>
          Requests
        </MobileChip>
        <MobileChip active={tab === "balance"} onClick={() => setTab("balance")}>
          Balance
        </MobileChip>
        <MobileChip active={tab === "history"} onClick={() => setTab("history")}>
          History
        </MobileChip>
        {canCreate ? (
          <MobileChip active={tab === "create"} onClick={() => setTab("create")}>
            New request
          </MobileChip>
        ) : null}
      </div>

      {tab === "create" && canCreate ? (
        <MobilePanel accent="bg-sky-500" className="space-y-3 p-4">
          {isOwnerView ? (
            <div>
              <Label>Staff</Label>
              <Select
                className="mt-1"
                value={form.userId || user?.id || ""}
                onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
              >
                <option value="">Select…</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || s.id}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div>
            <Label>Type</Label>
            <Select
              className="mt-1"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            >
              {LEAVE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>From</Label>
              <Input
                className="mt-1"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </div>
            <div>
              <Label>To</Label>
              <Input
                className="mt-1"
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <Label>Reason</Label>
            <Textarea
              className="mt-1 min-h-[72px]"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            />
          </div>
          <p className="text-xs text-slate-500">
            {leaveDaysBetween(form.startDate, form.endDate)} day(s)
          </p>
          <Button
            className="w-full"
            disabled={createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            {createMut.isPending ? "Submitting…" : "Submit request"}
          </Button>
        </MobilePanel>
      ) : null}

      {tab === "balance" ? (
        <MobilePanel className="p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-400">
            Annual Leave Balance · {calendarYear}
          </p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-violet-800 dark:text-violet-300">
            {balanceLoading ? "…" : myBalance}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Days left after approved leave
            {balanceData?.baseDays ? ` · base ${balanceData.baseDays}` : ""}.
          </p>
          {!isOwnerView ? (
            <p className="mt-2 text-xs text-slate-400">Showing your balance only.</p>
          ) : null}
        </MobilePanel>
      ) : null}

      {tab === "history" ? (
        <div className="space-y-2.5">
          {!historyRows.length ? (
            <MobilePanel>
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                No approved leave in the last 2 years.
              </p>
            </MobilePanel>
          ) : (
            historyRows.map((r) => {
              const start = r.startDate || r.fromDate;
              const end = r.endDate || r.toDate;
              return (
                <MobilePanel key={r.id || `${r.userId}-${start}`} className="p-4">
                  <p className="text-sm font-semibold">
                    {isOwnerView
                      ? staffDisplayName(staff, String(r.userId || r.staffId || "")) ||
                        r.userId ||
                        "Staff"
                      : r.type || "Leave"}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {r.type} · {formatDate(start)} → {formatDate(end)} ·{" "}
                    {r.days || leaveDaysBetween(start, end)} day(s)
                  </p>
                  {r.reason ? (
                    <p className="mt-2 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
                      {r.reason}
                    </p>
                  ) : null}
                </MobilePanel>
              );
            })
          )}
        </div>
      ) : null}

      {tab === "requests" ? (
        <div className="space-y-2.5">
          {!visible.length ? (
            <MobilePanel>
              <p className="px-4 py-8 text-center text-sm text-slate-500">No leave to show.</p>
            </MobilePanel>
          ) : (
            visible.map((r) => {
              const status = normalizeLeaveStatus(r.status);
              const id = String(r.id || "");
              const start = r.startDate || r.fromDate;
              const end = r.endDate || r.toDate;
              return (
                <MobilePanel key={id || `${r.userId}-${start}`} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {isOwnerView
                          ? staffDisplayName(staff, String(r.userId || r.staffId || "")) ||
                            r.userId ||
                            "Staff"
                          : r.type || "Leave"}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {r.type} · {formatDate(start)} → {formatDate(end)}
                      </p>
                    </div>
                    <Badge variant={leaveStatusBadgeVariant(status)}>{status}</Badge>
                  </div>
                  {r.reason ? (
                    <p className="mt-2 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
                      {r.reason}
                    </p>
                  ) : null}
                  {canApprove && status === "Pending" && id ? (
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1"
                        disabled={decideMut.isPending}
                        onClick={() => decideMut.mutate({ id, status: "Approved" })}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn("flex-1")}
                        disabled={decideMut.isPending}
                        onClick={() => decideMut.mutate({ id, status: "Rejected" })}
                      >
                        Reject
                      </Button>
                    </div>
                  ) : null}
                </MobilePanel>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
