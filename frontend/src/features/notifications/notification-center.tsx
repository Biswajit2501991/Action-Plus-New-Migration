"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Bell, KeyRound, Phone, Plane } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ClassicalModal } from "@/components/ui/classical-modal";
import { useAttendance, useSettings, useUsers, useVisitors } from "@/hooks/use-data";
import { localCalendarDateKey, localTodayCalendarKey } from "@/lib/domain/billing";
import {
  normalizeLeaveRequest,
  normalizeLeaveStatus,
  staffDisplayName,
} from "@/lib/domain/leave";
import { mergeApprovedLeaveIntoAttendance } from "@/lib/domain/attendance-records";
import {
  canViewPasswordResetNotifications,
  pendingPasswordResets,
} from "@/lib/domain/password-reset";
import {
  hasAccess,
  isBranchAdminUser,
  isMasterOwnerUser,
} from "@/lib/domain/permissions";
import { cn, formatDate } from "@/lib/utils";
import { attendanceApi, leaveApi, visitorsApi } from "@/services/api";
import { adminSetPassword, rejectPasswordReset } from "@/services/api/auth";
import { useAuthStore } from "@/stores";
import type { LeaveRequest, StaffUser, Visitor } from "@/types";

function visitorDisplayName(v: Visitor) {
  return String(v.fullName || v.name || "Visitor").trim();
}

function canDecideLeave(user: ReturnType<typeof useAuthStore.getState>["user"]) {
  if (!user) return false;
  if (!hasAccess(user, "leave", "viewLeaveRequests")) return false;
  return (
    isMasterOwnerUser(user) ||
    isBranchAdminUser(user) ||
    String(user.id || "").toLowerCase() === "manager" ||
    String(user.staffRole || user.role || "")
      .toLowerCase()
      .includes("owner")
  );
}

export function NotificationCenter() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const { data: users = [] } = useUsers();
  const { data: visitors = [] } = useVisitors();
  const { data: attendanceRecords = [] } = useAttendance();

  const [open, setOpen] = useState(false);
  const [busyLeaveId, setBusyLeaveId] = useState("");
  const [busyVisitorId, setBusyVisitorId] = useState("");
  const [approveFor, setApproveFor] = useState<StaffUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const canLeave = canDecideLeave(user);
  const canResets = canViewPasswordResetNotifications(user);
  const canVisitors = hasAccess(user, "members", "viewVisitors");

  const leavePending = useMemo(() => {
    if (!canLeave) return [] as LeaveRequest[];
    const reqs = ((settings?.leaveRequests || []) as LeaveRequest[]).map((r) =>
      normalizeLeaveRequest(r),
    );
    return reqs
      .filter((r) => normalizeLeaveStatus(r.status) === "Pending")
      .sort((a, b) =>
        String(b.createdAt || b.startDate || "").localeCompare(
          String(a.createdAt || a.startDate || ""),
        ),
      )
      .slice(0, 20);
  }, [canLeave, settings?.leaveRequests]);

  const passwordPending = useMemo(
    () => (canResets ? pendingPasswordResets(users).slice(0, 20) : []),
    [canResets, users],
  );

  const callbackPending = useMemo(() => {
    if (!canVisitors) return [] as Visitor[];
    const today = localTodayCalendarKey();
    return visitors
      .filter((v) => {
        if (String(v.status || "") === "Converted") return false;
        const tentative = localCalendarDateKey(String(v.tentativeJoiningDate || ""));
        if (!tentative || tentative !== today) return false;
        if (localCalendarDateKey(String(v.lastCalledAt || "")) === today) return false;
        return true;
      })
      .slice(0, 20);
  }, [canVisitors, visitors]);

  const total =
    leavePending.length + passwordPending.length + callbackPending.length;

  const leaveDecide = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: "Approved" | "Rejected";
    }) => {
      setBusyLeaveId(id);
      const updated = await leaveApi.update(id, { status });
      const request = normalizeLeaveRequest(
        updated || leavePending.find((r) => r.id === id) || { id },
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
            (String(row.userId || row.staffId) ===
              String(request.userId || request.staffId) &&
              row.status === "Leave" &&
              row.leaveAutoSynced),
        );
        if (touched.length) {
          await attendanceApi.saveRecords(touched).catch(() => undefined);
          await qc.invalidateQueries({ queryKey: ["attendance"] });
        }
      }
      return status;
    },
    onSuccess: async (status) => {
      toast.success(status === "Approved" ? "Leave approved" : "Leave rejected");
      await qc.invalidateQueries({ queryKey: ["settings"] });
      await qc.invalidateQueries({ queryKey: ["leave-balance"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not update leave"),
    onSettled: () => setBusyLeaveId(""),
  });

  const rejectReset = useMutation({
    mutationFn: (staffId: string) => rejectPasswordReset(staffId),
    onSuccess: async () => {
      toast.success("Password reset rejected");
      await qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approveReset = useMutation({
    mutationFn: async () => {
      if (!approveFor) return;
      const pwd = newPassword.trim();
      if (pwd.length < 6) throw new Error("Password must be at least 6 characters");
      if (pwd !== confirmPassword.trim()) throw new Error("Passwords do not match");
      return adminSetPassword(approveFor.id, pwd);
    },
    onSuccess: async () => {
      toast.success(`Password approved for ${approveFor?.name || approveFor?.id}`);
      setApproveFor(null);
      setNewPassword("");
      setConfirmPassword("");
      await qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markCalled = useMutation({
    mutationFn: async (visitor: Visitor) => {
      setBusyVisitorId(visitor.id);
      const next: Visitor = {
        ...visitor,
        lastCalledAt: new Date().toISOString(),
        lastCalledBy: String(user?.name || user?.id || ""),
        updatedAt: new Date().toISOString(),
      };
      const rest = visitors.filter((v) => v.id !== visitor.id);
      return visitorsApi.bulk([next, ...rest]);
    },
    onSuccess: async () => {
      toast.success("Marked as called");
      await qc.invalidateQueries({ queryKey: ["visitors"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setBusyVisitorId(""),
  });

  if (!user || (!canLeave && !canResets && !canVisitors)) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold tracking-wide transition",
          total
            ? "border-slate-800/15 bg-slate-900 text-white shadow-[0_8px_24px_-12px_rgba(15,23,42,0.55)] hover:bg-slate-800 dark:border-teal-400/30 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
            : "border-slate-200/90 bg-white/90 text-slate-600 shadow-sm hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.07]",
        )}
        aria-label={total ? `${total} notifications` : "Notifications"}
        aria-expanded={open}
        data-testid="notification-center-bell"
      >
        <Bell className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Alerts</span>
        {total > 0 ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-white/15 px-1.5 text-[10px] font-bold tabular-nums text-white dark:bg-slate-950/15 dark:text-slate-950">
            {total}
          </span>
        ) : null}
      </button>

      <ClassicalModal
        open={open && !approveFor}
        title="Notifications"
        description={
          total
            ? `${total} item${total === 1 ? "" : "s"} awaiting your decision`
            : "Your inbox is clear — nothing needs attention right now."
        }
        onClose={() => setOpen(false)}
        size="md"
        testId="notification-center-panel"
        headerAside={
          total > 0 ? (
            <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-[12px] font-semibold tabular-nums text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200">
              {total}
            </span>
          ) : null
        }
        footer={
          <Button variant="outline" onClick={() => setOpen(false)} className="rounded-xl">
            Close
          </Button>
        }
      >
        <div className="space-y-6">
          {canResets ? (
            <section>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/90 bg-slate-50 text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
                  <KeyRound className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Security
                  </p>
                  <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                    Password resets
                  </p>
                </div>
              </div>
              {!passwordPending.length ? (
                <p className="rounded-xl border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-400 dark:border-white/10">
                  No pending resets.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {passwordPending.map((staff) => (
                    <div
                      key={staff.id}
                      className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80 p-3.5 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset] dark:border-white/10 dark:from-white/[0.05] dark:to-transparent dark:shadow-none"
                      data-testid={`password-reset-notification-${staff.id}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-1 h-9 w-0.5 shrink-0 rounded-full bg-sky-500/80" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                            {staff.name || staff.id}
                          </p>
                          <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
                            Requested a password reset · {staff.email || staff.id}
                          </p>
                          <p className="mt-1.5 text-[10px] uppercase tracking-[0.16em] text-slate-400">
                            {formatDate(
                              String(
                                staff.passwordResetRequestedAt ||
                                  staff.password_reset_requested_at ||
                                  "",
                              ),
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3.5 flex gap-2">
                        <Button
                          size="sm"
                          className="h-9 flex-1 rounded-xl bg-slate-900 text-[12px] font-semibold tracking-wide text-white hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
                          onClick={() => {
                            setApproveFor(staff);
                            setOpen(false);
                          }}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-9 flex-1 rounded-xl border-slate-200 text-[12px] font-semibold tracking-wide dark:border-white/15"
                          disabled={rejectReset.isPending}
                          onClick={() => {
                            if (
                              confirm(
                                `Reject password reset for ${staff.name || staff.id}?`,
                              )
                            ) {
                              rejectReset.mutate(staff.id);
                            }
                          }}
                        >
                          Decline
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {canLeave ? (
            <section>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/90 bg-slate-50 text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
                  <Plane className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Staff
                  </p>
                  <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                    Leave approvals
                  </p>
                </div>
              </div>
              {!leavePending.length ? (
                <p className="rounded-xl border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-400 dark:border-white/10">
                  No pending leave.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {leavePending.map((n) => {
                    const busy = busyLeaveId === n.id;
                    const who =
                      staffDisplayName(users, n.userId || n.staffId) ||
                      n.userId ||
                      n.staffId ||
                      "Staff";
                    return (
                      <div
                        key={n.id}
                        className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80 p-3.5 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset] dark:border-white/10 dark:from-white/[0.05] dark:to-transparent dark:shadow-none"
                        data-testid={`leave-notification-${n.id}`}
                      >
                        <button
                          type="button"
                          className="flex w-full items-start gap-3 text-left"
                          onClick={() => {
                            setOpen(false);
                            router.push("/leave");
                          }}
                        >
                          <span className="mt-1 h-9 w-0.5 shrink-0 rounded-full bg-emerald-500/80" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[14px] font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                              {n.type || "Leave"} · {who}
                            </p>
                            <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
                              {formatDate(n.startDate)} – {formatDate(n.endDate)}
                              {n.days ? ` · ${n.days} day${n.days === 1 ? "" : "s"}` : ""}
                            </p>
                          </div>
                        </button>
                        <div className="mt-3.5 flex gap-2">
                          <Button
                            size="sm"
                            className="h-9 flex-1 rounded-xl border border-emerald-700/20 bg-emerald-700 text-[12px] font-semibold tracking-wide text-white hover:bg-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-200 dark:hover:bg-emerald-400/25"
                            disabled={busy}
                            data-testid={`leave-notification-approve-${n.id}`}
                            onClick={() =>
                              leaveDecide.mutate({ id: n.id, status: "Approved" })
                            }
                          >
                            {busy ? "…" : "Approve"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9 flex-1 rounded-xl border-slate-200 text-[12px] font-semibold tracking-wide text-rose-700 hover:bg-rose-50 dark:border-white/15 dark:text-rose-300 dark:hover:bg-rose-950/30"
                            disabled={busy}
                            data-testid={`leave-notification-reject-${n.id}`}
                            onClick={() =>
                              leaveDecide.mutate({ id: n.id, status: "Rejected" })
                            }
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}

          {canVisitors ? (
            <section>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/90 bg-slate-50 text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
                  <Phone className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Outreach
                  </p>
                  <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
                    Visitor callbacks
                  </p>
                </div>
              </div>
              {!callbackPending.length ? (
                <p className="rounded-xl border border-dashed border-slate-200 px-3 py-3 text-xs text-slate-400 dark:border-white/10">
                  No callbacks due today.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {callbackPending.map((v) => (
                    <div
                      key={v.id}
                      className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80 p-3.5 shadow-[0_1px_0_rgba(255,255,255,0.8)_inset] dark:border-white/10 dark:from-white/[0.05] dark:to-transparent dark:shadow-none"
                    >
                      <button
                        type="button"
                        className="flex w-full items-start gap-3 text-left"
                        onClick={() => {
                          setOpen(false);
                          router.push("/members?tab=visitors");
                        }}
                      >
                        <span className="mt-1 h-9 w-0.5 shrink-0 rounded-full bg-amber-500/85" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-semibold tracking-tight text-slate-900 dark:text-slate-50">
                            Call {visitorDisplayName(v)}
                          </p>
                          <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
                            {v.mobile || "—"} · joining{" "}
                            {formatDate(String(v.tentativeJoiningDate || ""))}
                          </p>
                        </div>
                      </button>
                      <Button
                        size="sm"
                        className="mt-3.5 h-9 w-full rounded-xl border border-emerald-700/20 bg-emerald-700 text-[12px] font-semibold tracking-wide text-white hover:bg-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/15 dark:text-emerald-200 dark:hover:bg-emerald-400/25"
                        disabled={busyVisitorId === v.id}
                        onClick={() => markCalled.mutate(v)}
                      >
                        {busyVisitorId === v.id ? "Saving…" : "Mark as called"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </div>
      </ClassicalModal>

      <ClassicalModal
        open={Boolean(approveFor)}
        title="Approve password reset"
        description={
          approveFor
            ? `Set a temporary password for ${approveFor.name || approveFor.id}. Share it securely.`
            : undefined
        }
        onClose={() => {
          setApproveFor(null);
          setNewPassword("");
          setConfirmPassword("");
        }}
        footer={
          <>
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => {
                setApproveFor(null);
                setNewPassword("");
                setConfirmPassword("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => approveReset.mutate()}
              disabled={approveReset.isPending}
              className="rounded-xl bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
            >
              {approveReset.isPending ? "Saving…" : "Approve & set password"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label>New password</Label>
            <Input
              className="mt-1"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div>
            <Label>Confirm password</Label>
            <Input
              className="mt-1"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
        </div>
      </ClassicalModal>
    </div>
  );
}
