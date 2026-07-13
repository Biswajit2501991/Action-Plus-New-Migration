"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  leaveDaysBetween,
  leaveStatusBadgeVariant,
  leaveSubmitErrorMessage,
  normalizeLeaveRequest,
  normalizeLeaveStatus,
  staffDisplayName,
} from "@/lib/domain/leave";
import { useAuthStore } from "@/stores";
import { ApiError } from "@/services/api/client";
import type { LeaveRequest } from "@/types";

export function MobileLeave() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { data: settings, isLoading } = useSettings();
  const { data: users = [] } = useUsers();

  const canCreate = hasAccess(user, "leave", "viewCreateLeaveRequest");
  const canViewRequests = hasAccess(user, "leave", "viewLeaveRequests");
  const isOwnerOrManager =
    String(user?.id || "").toLowerCase() === "owner" ||
    String(user?.id || "").toLowerCase() === "manager" ||
    String(user?.staffRole || user?.role || "")
      .toLowerCase()
      .includes("owner") ||
    String(user?.staffRole || user?.role || "")
      .toLowerCase()
      .includes("manager");
  const canApprove = isOwnerOrManager && canViewRequests;

  const staff = useMemo(() => (users || []).filter((u) => !u.blocked), [users]);
  const today = localTodayCalendarKey();
  const [tab, setTab] = useState<"requests" | "create">("requests");
  const [form, setForm] = useState({
    userId: "",
    type: "Casual",
    startDate: today,
    endDate: today,
    reason: "",
  });

  const leaveRequests = useMemo(
    () =>
      ((settings?.leaveRequests || []) as LeaveRequest[])
        .map((r) => normalizeLeaveRequest(r))
        .sort((a, b) =>
          String(b.startDate || b.fromDate || "").localeCompare(
            String(a.startDate || a.fromDate || ""),
          ),
        ),
    [settings?.leaveRequests],
  );

  const visible = useMemo(() => {
    if (isOwnerOrManager) return leaveRequests.slice(0, 40);
    const id = String(user?.id || "");
    return leaveRequests
      .filter((r) => String(r.userId || r.staffId || "") === id)
      .slice(0, 40);
  }, [leaveRequests, isOwnerOrManager, user?.id]);

  const createMut = useMutation({
    mutationFn: async () => {
      const userId = form.userId || user?.id || "";
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
        subtitle="Request and review leave without the desktop clutter."
      />

      <div className="flex gap-2">
        <MobileChip active={tab === "requests"} onClick={() => setTab("requests")}>
          Requests
        </MobileChip>
        {canCreate ? (
          <MobileChip active={tab === "create"} onClick={() => setTab("create")}>
            New request
          </MobileChip>
        ) : null}
      </div>

      {tab === "create" && canCreate ? (
        <MobilePanel accent="bg-sky-500" className="space-y-3 p-4">
          {isOwnerOrManager ? (
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
                        {staffDisplayName(staff, String(r.userId || r.staffId || "")) ||
                          r.userId ||
                          "Staff"}
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
