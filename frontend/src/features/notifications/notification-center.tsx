"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Bell, KeyRound, Phone, Plane, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ClassicalModal } from "@/components/ui/classical-modal";
import { useAttendance, useSettings, useUsers, useVisitors } from "@/hooks/use-data";
import { useRealtimeConnected } from "@/hooks/use-realtime";
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
  pendingNewVisitorAlerts,
  withStaffSeenAck,
} from "@/lib/domain/new-visitors";
import {
  hasAccess,
  isBranchAdminUser,
  isMasterOwnerUser,
} from "@/lib/domain/permissions";
import { websiteVisitorBadge } from "@/features/visitors/website-intake";
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
  const canLeave = canDecideLeave(user);
  const canResets = canViewPasswordResetNotifications(user);
  const canVisitors = hasAccess(user, "members", "viewVisitors");
  const realtimeConnected = useRealtimeConnected();

  // Dedicated leave scope + poll so owner bell updates without a hard refresh
  // even when the Next.js SSE proxy drops realtime frames.
  const leavePollMs = canLeave ? (realtimeConnected ? 20_000 : 6_000) : false;
  const { data: leaveSettings } = useSettings("leave", {
    enabled: canLeave,
    refetchInterval: leavePollMs,
  });
  const { data: users = [] } = useUsers();
  const { data: visitors = [] } = useVisitors();
  const { data: attendanceRecords = [] } = useAttendance();

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [busyLeaveId, setBusyLeaveId] = useState("");
  const [busyVisitorId, setBusyVisitorId] = useState("");
  const [approveFor, setApproveFor] = useState<StaffUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const leavePending = useMemo(() => {
    if (!canLeave) return [] as LeaveRequest[];
    const reqs = ((leaveSettings?.leaveRequests || []) as LeaveRequest[]).map((r) =>
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
  }, [canLeave, leaveSettings?.leaveRequests]);

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

  // Shared across all staff: any one acknowledgement clears the alert for everyone.
  const newVisitorPending = useMemo(
    () => (canVisitors ? pendingNewVisitorAlerts(visitors) : ([] as Visitor[])),
    [canVisitors, visitors],
  );

  const total =
    leavePending.length +
    passwordPending.length +
    callbackPending.length +
    newVisitorPending.length;

  useEffect(() => {
    if (!open) return;
    if (canLeave) {
      void qc.invalidateQueries({ queryKey: ["settings", "leave"] });
    }
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, canLeave, qc]);

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

  const markVisitorSeen = useMutation({
    mutationFn: async (visitor: Visitor) => {
      setBusyVisitorId(visitor.id);
      const next = withStaffSeenAck(
        visitor,
        String(user?.name || user?.id || ""),
      );
      const rest = visitors.filter((v) => v.id !== visitor.id);
      return visitorsApi.bulk([next, ...rest]);
    },
    onSuccess: async () => {
      toast.success("Visitor alert cleared for all staff");
      await qc.invalidateQueries({ queryKey: ["visitors"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setBusyVisitorId(""),
  });

  const openAndAckVisitor = async (visitor: Visitor) => {
    setOpen(false);
    try {
      await markVisitorSeen.mutateAsync(visitor);
    } catch {
      // Navigation still helps staff review the visitor list.
    }
    router.push("/members?tab=visitors");
  };

  if (!user || (!canLeave && !canResets && !canVisitors)) return null;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition",
          total
            ? "border-amber-200/80 bg-amber-50/90 text-amber-950 hover:bg-amber-100 dark:border-amber-500/25 dark:bg-amber-950/40 dark:text-amber-100"
            : "border-slate-200/80 bg-white/80 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300",
        )}
        aria-label={total ? `${total} notifications` : "Notifications"}
        aria-expanded={open}
        data-testid="notification-center-bell"
      >
        <Bell className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Alerts</span>
        {total > 0 ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-slate-900 px-1.5 text-[10px] font-bold text-white dark:bg-teal-400 dark:text-slate-950">
            {total}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 top-11 z-[95] w-[min(100vw-1.5rem,24rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0f141c]"
          data-testid="notification-center-panel"
        >
          <div className="border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              Inbox
            </p>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              Owner notifications
            </p>
            <p className="text-[11px] text-slate-500">
              {total
                ? `${total} item${total === 1 ? "" : "s"} need attention`
                : "All clear for now"}
            </p>
          </div>

          <div className="max-h-[min(70vh,28rem)] space-y-3 overflow-y-auto p-3">
            {canResets ? (
              <section>
                <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <KeyRound className="h-3.5 w-3.5" />
                  Password resets
                </div>
                {!passwordPending.length ? (
                  <p className="px-1 text-xs text-slate-400">No pending resets.</p>
                ) : (
                  <div className="space-y-1.5">
                    {passwordPending.map((staff) => (
                      <div
                        key={staff.id}
                        className="rounded-xl border border-blue-200/80 bg-blue-50/70 p-2.5 dark:border-blue-500/20 dark:bg-blue-950/30"
                        data-testid={`password-reset-notification-${staff.id}`}
                      >
                        <p className="text-xs font-semibold text-blue-950 dark:text-blue-100">
                          {staff.name || staff.id} requested a password reset
                        </p>
                        <p className="text-[11px] text-blue-800/80 dark:text-blue-200/70">
                          {staff.email || staff.id} ·{" "}
                          {formatDate(
                            String(
                              staff.passwordResetRequestedAt ||
                                staff.password_reset_requested_at ||
                                "",
                            ),
                          )}
                        </p>
                        <div className="mt-2 flex gap-1.5">
                          <Button
                            size="sm"
                            className="h-7 flex-1 bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950"
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
                            className="h-7 flex-1"
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
                            Reject
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
                <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <Plane className="h-3.5 w-3.5" />
                  Leave approvals
                </div>
                {!leavePending.length ? (
                  <p className="px-1 text-xs text-slate-400">No pending leave.</p>
                ) : (
                  <div className="space-y-1.5">
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
                          className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 dark:border-white/10 dark:bg-white/[0.03]"
                          data-testid={`leave-notification-${n.id}`}
                        >
                          <button
                            type="button"
                            className="w-full text-left"
                            onClick={() => {
                              setOpen(false);
                              router.push("/leave");
                            }}
                          >
                            <p className="text-xs font-semibold text-slate-900 dark:text-slate-50">
                              {n.type || "Leave"} · {who}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {formatDate(n.startDate)} – {formatDate(n.endDate)}
                              {n.days ? ` · ${n.days}d` : ""}
                            </p>
                          </button>
                          <div className="mt-2 flex gap-1.5">
                            <Button
                              size="sm"
                              className="h-7 flex-1 border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
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
                              className="h-7 flex-1 border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300"
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
                <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <UserRoundPlus className="h-3.5 w-3.5" />
                  New visitors
                </div>
                {!newVisitorPending.length ? (
                  <p className="px-1 text-xs text-slate-400">No new visitors.</p>
                ) : (
                  <div className="space-y-1.5">
                    {newVisitorPending.map((v) => {
                      const website = websiteVisitorBadge(v.intakeSource);
                      return (
                        <div
                          key={`new-${v.id}`}
                          className="rounded-xl border border-teal-200/80 bg-teal-50/80 p-2.5 dark:border-teal-500/20 dark:bg-teal-950/30"
                          data-testid={`new-visitor-notification-${v.id}`}
                        >
                          <button
                            type="button"
                            className="w-full text-left"
                            onClick={() => void openAndAckVisitor(v)}
                          >
                            <p className="text-xs font-semibold text-teal-950 dark:text-teal-100">
                              New visitor · {visitorDisplayName(v)}
                            </p>
                            <p className="text-[11px] text-teal-800/80 dark:text-teal-200/70">
                              {v.mobile || "—"}
                              {website ? ` · ${website}` : ""}
                              {" · "}
                              {formatDate(String(v.addedAt || v.visitDate || ""))}
                            </p>
                            <p className="mt-1 text-[10px] text-teal-700/70 dark:text-teal-200/60">
                              Open to review — clears this alert for all staff
                            </p>
                          </button>
                          <div className="mt-2 flex gap-1.5">
                            <Button
                              size="sm"
                              className="h-7 flex-1 bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950"
                              disabled={busyVisitorId === v.id}
                              onClick={() => void openAndAckVisitor(v)}
                            >
                              {busyVisitorId === v.id ? "…" : "Open & clear"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 flex-1"
                              disabled={busyVisitorId === v.id}
                              onClick={() => markVisitorSeen.mutate(v)}
                            >
                              Got it
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
                <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <Phone className="h-3.5 w-3.5" />
                  Visitor call backs
                </div>
                {!callbackPending.length ? (
                  <p className="px-1 text-xs text-slate-400">No callbacks due today.</p>
                ) : (
                  <div className="space-y-1.5">
                    {callbackPending.map((v) => (
                      <div
                        key={v.id}
                        className="rounded-xl border border-amber-200/80 bg-amber-50/80 p-2.5 dark:border-amber-500/20 dark:bg-amber-950/30"
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => {
                            setOpen(false);
                            router.push("/members?tab=visitors");
                          }}
                        >
                          <p className="text-xs font-semibold text-amber-950 dark:text-amber-100">
                            Call {visitorDisplayName(v)} today
                          </p>
                          <p className="text-[11px] text-amber-800/80 dark:text-amber-200/70">
                            {v.mobile || "—"} · join{" "}
                            {formatDate(String(v.tentativeJoiningDate || ""))}
                          </p>
                        </button>
                        <Button
                          size="sm"
                          className="mt-2 h-7 w-full border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
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
        </div>
      ) : null}

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
              className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
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
