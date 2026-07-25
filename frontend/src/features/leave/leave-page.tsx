"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader, Badge, Skeleton, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useAttendance, useSettings, useUsers } from "@/hooks/use-data";
import { attendanceApi, leaveApi } from "@/services/api";
import { cn, formatDate } from "@/lib/utils";
import { hasAccess } from "@/lib/domain/permissions";
import { mergeApprovedLeaveIntoAttendance } from "@/lib/domain/attendance-records";
import { localTodayCalendarKey } from "@/lib/domain/billing";
import {
  LEAVE_TYPES,
  annualLeaveBalanceRemaining,
  buildStaffLoginAliasMap,
  canReviewAllLeave,
  filterLeaveRequestsForViewer,
  findLeaveDateConflicts,
  formatLeaveOverlapError,
  leaveDaysBetween,
  leaveRequestMatchesStaff,
  leaveStatusBadgeVariant,
  leaveSubmitErrorMessage,
  normalizeLeaveRequest,
  normalizeLeaveStatus,
  staffDisplayName,
} from "@/lib/domain/leave";
import { useAuthStore } from "@/stores";
import { ApiError } from "@/services/api/client";
import type { LeaveRequest } from "@/types";

export function LeavePage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const canCreate = hasAccess(user, "leave", "viewCreateLeaveRequest");
  const canViewRequests = hasAccess(user, "leave", "viewLeaveRequests");
  const canViewBalance = hasAccess(user, "leave", "viewAnnualLeaveBalance");
  const canViewHistory = hasAccess(user, "leave", "viewLeaveHistory");
  const { data: settings, isLoading } = useSettings(undefined, {
    refetchInterval: canViewRequests ? 12_000 : false,
  });
  const { data: users = [] } = useUsers();
  const { data: attendanceRecords = [] } = useAttendance();

  const isOwnerView = canReviewAllLeave(user);
  const canApprove = isOwnerView && canViewRequests;
  // Staff on Leave always see their own requests / balance / history.
  const showRequests = isOwnerView ? canViewRequests : true;
  const showBalance = isOwnerView ? canViewBalance : true;
  const showHistory = isOwnerView ? canViewHistory : true;

  const staff = useMemo(() => (users || []).filter((u) => !u.blocked), [users]);
  const aliasMap = useMemo(() => buildStaffLoginAliasMap(staff), [staff]);
  const calendarYear = new Date().getFullYear();
  const today = localTodayCalendarKey();
  const viewerId = String(user?.id || "").trim();

  const leaveRequests = useMemo(
    () =>
      filterLeaveRequestsForViewer(
        ((settings?.leaveRequests || []) as LeaveRequest[]).map((r) => normalizeLeaveRequest(r)),
        viewerId,
        { reviewAll: isOwnerView, aliasMap },
      ),
    [settings?.leaveRequests, viewerId, isOwnerView, aliasMap],
  );

  const [form, setForm] = useState({
    userId: "",
    type: "Casual",
    startDate: today,
    endDate: today,
    reason: "",
  });
  const [formError, setFormError] = useState("");
  const [historyFilter, setHistoryFilter] = useState("");

  // Keep form userId in sync once user loads
  const effectiveFormUserId = form.userId || user?.id || "";

  const { data: balanceData, isLoading: balanceLoading } = useQuery({
    queryKey: ["leave-balance", calendarYear, viewerId, isOwnerView ? "all" : "self"],
    queryFn: () => leaveApi.balances(calendarYear),
    enabled: Boolean(user) && showBalance,
  });

  const create = useMutation({
    mutationFn: async () => {
      setFormError("");
      const userId = isOwnerView ? effectiveFormUserId : String(user?.id || "");
      if (!userId) throw new Error("Staff is required");
      if (!form.startDate || !form.endDate) throw new Error("Please enter valid start and end dates.");
      if (form.endDate < form.startDate) throw new Error("End date cannot be before start date.");

      const conflicts = findLeaveDateConflicts(
        form.startDate,
        form.endDate,
        leaveRequests,
        userId,
        { aliasMap },
      );
      if (conflicts.hasConflict) {
        throw Object.assign(new Error(formatLeaveOverlapError(conflicts.conflicts)), {
          code: "leave-overlap",
          conflictDates: conflicts.conflicts,
        });
      }

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
      toast.success("Leave requested");
      setForm({
        userId: isOwnerView ? "" : user?.id || "",
        type: "Casual",
        startDate: today,
        endDate: today,
        reason: "",
      });
      setFormError("");
      await qc.invalidateQueries({ queryKey: ["settings"] });
      await qc.invalidateQueries({ queryKey: ["leave-balance"] });
    },
    onError: (e: Error) => {
      const msg =
        e instanceof ApiError
          ? leaveSubmitErrorMessage({
              message: e.message,
              status: e.status,
              code: e.code,
            })
          : leaveSubmitErrorMessage(e as { message?: string; code?: string; conflictDates?: string[] });
      setFormError(msg);
      toast.error(msg);
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "Approved" | "Rejected" }) => {
      const updated = await leaveApi.update(id, { status });
      const request = normalizeLeaveRequest(
        updated || leaveRequests.find((r) => r.id === id) || { id },
      );
      if (status === "Approved") {
        const synced = mergeApprovedLeaveIntoAttendance(
          attendanceRecords,
          request,
          String(user?.name || user?.id || ""),
        );
        const touched = synced.filter(
          (row) =>
            row.leaveRequestId === id ||
            (String(row.userId || row.staffId) === String(request.userId || request.staffId) &&
              row.status === "Leave" &&
              row.leaveAutoSynced),
        );
        if (touched.length) {
          await attendanceApi.saveRecords(touched).catch(() => undefined);
          await qc.invalidateQueries({ queryKey: ["attendance"] });
        }
      }
      return updated;
    },
    onSuccess: async (_data, vars) => {
      toast.success(vars.status === "Approved" ? "Leave approved" : "Leave rejected");
      await qc.invalidateQueries({ queryKey: ["settings"] });
      await qc.invalidateQueries({ queryKey: ["leave-balance"] });
    },
    onError: (e: Error) => toast.error(e.message || "Update failed"),
  });

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
      .filter((r) => {
        if (!isOwnerView) {
          return leaveRequestMatchesStaff(r.userId || r.staffId, viewerId, aliasMap);
        }
        if (!historyFilter) return true;
        return leaveRequestMatchesStaff(r.userId || r.staffId, historyFilter, aliasMap);
      })
      .sort((a, b) =>
        String(b.startDate || b.fromDate || "").localeCompare(String(a.startDate || a.fromDate || "")),
      );
  }, [leaveRequests, historyFilter, isOwnerView, viewerId, aliasMap]);

  const balanceRows = useMemo(() => {
    const apiRows = Array.isArray(balanceData?.rows) ? balanceData.rows : [];
    let rows = apiRows.length
      ? apiRows.map((row) => {
          const id = String(
            (row as { userId?: string; staffLoginId?: string }).userId ||
              row.staffLoginId ||
              "",
          ).trim();
          const name = String(
            (row as { name?: string; staffName?: string }).name ||
              row.staffName ||
              staffDisplayName(staff, id) ||
              id ||
              "—",
          );
          const remaining = Number(
            (row as { balance?: number; remainingDays?: number }).balance ??
              row.remainingDays ??
              0,
          );
          return {
            id: id || name,
            name,
            remaining: Number.isFinite(remaining) ? remaining : 0,
            used: Number(row.usedDays ?? 0),
            base: Number(row.baseDays ?? balanceData?.baseDays ?? 24),
          };
        })
      : (() => {
          const base = Number(balanceData?.baseDays ?? 24);
          const adjustments = (balanceData?.adjustments || []) as Array<Record<string, unknown>>;
          return staff.map((s) => ({
            id: s.id,
            name: s.name || s.id,
            remaining: annualLeaveBalanceRemaining(leaveRequests, s.id, {
              year: calendarYear,
              baseDays: base,
              aliasMap,
              adjustments: adjustments as never,
            }),
            used: 0,
            base,
          }));
        })();

    if (!isOwnerView) {
      rows = rows.filter((row) => leaveRequestMatchesStaff(row.id, viewerId, aliasMap));
      if (!rows.length && viewerId) {
        const base = Number(balanceData?.baseDays ?? 24);
        const adjustments = (balanceData?.adjustments || []) as Array<Record<string, unknown>>;
        rows = [
          {
            id: viewerId,
            name: String(user?.name || viewerId),
            remaining: annualLeaveBalanceRemaining(leaveRequests, viewerId, {
              year: calendarYear,
              baseDays: base,
              aliasMap,
              adjustments: adjustments as never,
            }),
            used: 0,
            base,
          },
        ];
      }
    }
    return rows;
  }, [
    balanceData,
    staff,
    leaveRequests,
    aliasMap,
    calendarYear,
    isOwnerView,
    viewerId,
    user?.name,
  ]);

  if (isLoading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Leave Tracker"
        description={
          isOwnerView
            ? "Request leave, review approvals, balances, and two-year history."
            : "Your leave requests, annual balance, and two-year history."
        }
      />

      {!isOwnerView ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="border-slate-200 shadow-sm dark:border-border">
            <CardContent className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                Leave Requests
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{leaveRequests.length}</p>
              <p className="text-xs text-muted-foreground">Your total</p>
            </CardContent>
          </Card>
          <Card className="border-violet-100 shadow-sm dark:border-border">
            <CardContent className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-400">
                Annual Balance · {calendarYear}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-violet-800 dark:text-violet-300">
                {balanceLoading ? "…" : balanceRows[0]?.remaining ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground">Days left</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm dark:border-border">
            <CardContent className="p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                Leave History
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{historyRows.length}</p>
              <p className="text-xs text-muted-foreground">Approved · last 2 years</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {canCreate ? (
        <Card className="overflow-hidden border-sky-100 shadow-sm dark:border-border">
          <div className="border-b border-sky-100 bg-gradient-to-r from-sky-50 to-white px-4 py-3 dark:border-border dark:from-sky-950/30 dark:to-card">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-foreground">
              Create Leave Request
            </h2>
            <p className="text-xs text-muted-foreground">
              Choose type and dates. Overlaps with pending/approved leave are blocked.
            </p>
          </div>
          <CardContent className="grid gap-3 p-4 md:grid-cols-2 lg:grid-cols-6">
            {isOwnerView ? (
              <div className="lg:col-span-2">
                <Label>Staff</Label>
                <Select
                  className="mt-1"
                  value={effectiveFormUserId}
                  onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
                >
                  <option value="">Select staff…</option>
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
            <div>
              <Label>Start</Label>
              <Input
                className="mt-1"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              />
            </div>
            <div>
              <Label>End</Label>
              <Input
                className="mt-1"
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              />
            </div>
            <div className={cn(isOwnerView ? "lg:col-span-6" : "lg:col-span-2", "md:col-span-2")}>
              <Label>Reason</Label>
              <Textarea
                className="mt-1 min-h-[72px]"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Optional note for your manager"
              />
            </div>
            {formError ? (
              <div className="lg:col-span-6 whitespace-pre-wrap rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {formError}
              </div>
            ) : null}
            <div className="flex items-end lg:col-span-6">
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending ? "Submitting…" : "Submit request"}
              </Button>
              <span className="ml-3 text-xs text-muted-foreground">
                {leaveDaysBetween(form.startDate, form.endDate)} day
                {leaveDaysBetween(form.startDate, form.endDate) === 1 ? "" : "s"}
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {showRequests ? (
        <Card className="border-slate-200 shadow-sm dark:border-border">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-border">
            <h2 className="text-sm font-semibold">Leave Requests</h2>
            <p className="text-xs text-muted-foreground">
              {leaveRequests.length} total
              {!isOwnerView ? " · your requests only" : ""}
            </p>
          </div>
          <CardContent className="space-y-2 p-4">
            {leaveRequests.map((r) => {
              const status = normalizeLeaveStatus(r.status);
              return (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm dark:border-border"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-foreground">
                      {staffDisplayName(staff, r.userId || r.staffId)} · {r.type || "Casual"} ·{" "}
                      {r.days || leaveDaysBetween(r.startDate, r.endDate)} day
                      {(r.days || leaveDaysBetween(r.startDate, r.endDate)) === 1 ? "" : "s"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(r.startDate || r.fromDate)} → {formatDate(r.endDate || r.toDate)}
                      {r.reason ? ` · ${r.reason}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={leaveStatusBadgeVariant(status)}>{status}</Badge>
                    {status === "Pending" && canApprove ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 border-emerald-300 bg-emerald-50 text-emerald-800"
                          onClick={() => update.mutate({ id: r.id, status: "Approved" })}
                          disabled={update.isPending}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-rose-700"
                          onClick={() => update.mutate({ id: r.id, status: "Rejected" })}
                          disabled={update.isPending}
                        >
                          Reject
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
            {!leaveRequests.length ? (
              <EmptyState title="No leave requests" description="Submitted leave will appear here." />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {showBalance ? (
        <Card className="border-violet-100 shadow-sm dark:border-border">
          <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 to-white px-4 py-3 dark:border-border dark:from-violet-950/30 dark:to-card">
            <h2 className="text-sm font-semibold">Annual Leave Balance · {calendarYear}</h2>
            <p className="text-xs text-muted-foreground">
              {isOwnerView
                ? "Remaining days after approved leave"
                : "Your remaining days after approved leave"}
              {balanceData?.baseDays ? ` · base ${balanceData.baseDays}` : ""}.
            </p>
          </div>
          <CardContent className="p-4">
            {balanceLoading ? (
              <Skeleton className="h-24" />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {balanceRows.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-xl border border-violet-100 bg-white px-3 py-2.5 dark:border-border dark:bg-card"
                  >
                    <div className="text-sm font-semibold">{row.name}</div>
                    <div className="mt-1 text-lg font-semibold tabular-nums text-violet-800 dark:text-violet-300">
                      {row.remaining}
                      <span className="ml-1 text-xs font-medium text-muted-foreground">days left</span>
                    </div>
                  </div>
                ))}
                {!balanceRows.length ? (
                  <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
                    No active staff found for leave balance. Check Staff users are not blocked.
                  </p>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {showHistory ? (
        <Card className="border-slate-200 shadow-sm dark:border-border">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-border">
            <div>
              <h2 className="text-sm font-semibold">Leave History (2 years)</h2>
              <p className="text-xs text-muted-foreground">
                Approved leave only
                {!isOwnerView ? " · your history only" : ""}
              </p>
            </div>
            {isOwnerView ? (
              <Select
                className="h-9 w-[200px]"
                value={historyFilter}
                onChange={(e) => setHistoryFilter(e.target.value)}
              >
                <option value="">All staff</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name || s.id}
                  </option>
                ))}
              </Select>
            ) : null}
          </div>
          <CardContent className="overflow-x-auto p-0">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs text-slate-600 dark:bg-muted dark:text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">Staff</th>
                  <th className="px-4 py-2.5 font-semibold">Type</th>
                  <th className="px-4 py-2.5 font-semibold">Dates</th>
                  <th className="px-4 py-2.5 font-semibold">Days</th>
                  <th className="px-4 py-2.5 font-semibold">Reason</th>
                </tr>
              </thead>
              <tbody>
                {historyRows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 dark:border-border">
                    <td className="px-4 py-2.5">
                      {staffDisplayName(staff, r.userId || r.staffId)}
                    </td>
                    <td className="px-4 py-2.5">{r.type || "Casual"}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      {formatDate(r.startDate || r.fromDate)} → {formatDate(r.endDate || r.toDate)}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {r.days || leaveDaysBetween(r.startDate, r.endDate)}
                    </td>
                    <td className="max-w-[240px] truncate px-4 py-2.5 text-muted-foreground">
                      {r.reason || "—"}
                    </td>
                  </tr>
                ))}
                {!historyRows.length ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No approved leave in the last 2 years.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
