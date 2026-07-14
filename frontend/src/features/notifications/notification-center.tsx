"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useSettings,
  useUsers,
  useVisitors,
} from "@/hooks/use-data";
import {
  hasAccess,
  isBranchAdminUser,
  isMasterOwnerUser,
} from "@/lib/domain/permissions";
import { localCalendarDateKey, localTodayCalendarKey } from "@/lib/domain/billing";
import { leaveApi, visitorsApi } from "@/services/api";
import { adminSetPassword, rejectPasswordReset } from "@/services/api/auth";
import { useAuthStore, useUiStore } from "@/stores";
import type { LeaveRequest, StaffUser, Visitor } from "@/types";
import { cn } from "@/lib/utils";

function isPasswordResetPending(user: StaffUser) {
  if (!user || String(user.id || "").toLowerCase() === "owner") return false;
  if (String(user.passwordResetStatus || "").toLowerCase() === "pending") return true;
  const requested =
    user.passwordResetRequestedAt ||
    (user as { password_reset_requested_at?: string }).password_reset_requested_at;
  if (!requested) return false;
  const approved =
    user.passwordResetApprovedAt ||
    (user as { password_reset_approved_at?: string }).password_reset_approved_at;
  const rejected =
    user.passwordResetRejectedAt ||
    (user as { password_reset_rejected_at?: string }).password_reset_rejected_at;
  const reqMs = new Date(String(requested)).getTime();
  if (!Number.isFinite(reqMs)) return false;
  const appMs = approved ? new Date(String(approved)).getTime() : NaN;
  const rejMs = rejected ? new Date(String(rejected)).getTime() : NaN;
  if (Number.isFinite(appMs) && appMs >= reqMs) return false;
  if (Number.isFinite(rejMs) && rejMs >= reqMs) return false;
  return true;
}

function visitorNeedsCallback(v: Visitor) {
  if (String(v.status || "") === "Converted") return false;
  const join = String(v.tentativeJoiningDate || "").slice(0, 10);
  if (join !== localTodayCalendarKey()) return false;
  const called = String(v.lastCalledAt || "").trim();
  if (called && localCalendarDateKey(called) === localTodayCalendarKey()) return false;
  return true;
}

function visitorName(v: Visitor) {
  return String(v.fullName || v.name || "Visitor");
}

export function NotificationCenter() {
  const user = useAuthStore((s) => s.user);
  const setAddMemberOpen = useUiStore((s) => s.setAddMemberOpen);
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [pwdDraft, setPwdDraft] = useState<Record<string, string>>({});

  const isOwner = isMasterOwnerUser(user);
  const canPwd = isOwner || isBranchAdminUser(user);
  const canVisitors = hasAccess(user, "members", "viewVisitors");

  const { data: settings } = useSettings(isOwner ? "leave" : undefined);
  const { data: visitors = [] } = useVisitors();
  const { data: users = [] } = useUsers();

  const leavePending = useMemo(() => {
    if (!isOwner) return [] as LeaveRequest[];
    const source = Array.isArray(settings?.leaveRequests)
      ? (settings?.leaveRequests as LeaveRequest[])
      : [];
    return source
      .filter((r) => String(r.status || "").toLowerCase() === "pending")
      .slice(0, 20);
  }, [isOwner, settings?.leaveRequests]);

  const callbacks = useMemo(() => {
    if (!canVisitors) return [] as Visitor[];
    return visitors.filter(visitorNeedsCallback).slice(0, 20);
  }, [canVisitors, visitors]);

  const passwordResets = useMemo(() => {
    if (!canPwd) return [] as StaffUser[];
    return users.filter(isPasswordResetPending).slice(0, 20);
  }, [canPwd, users]);

  const count = leavePending.length + callbacks.length + passwordResets.length;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!user) return null;
  if (!isOwner && !canVisitors && !canPwd) return null;

  return (
    <div className="relative" ref={rootRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative rounded-xl"
        aria-label="Notifications"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="h-4 w-4" />
        {count > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div className="absolute right-0 z-[90] mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-xs text-muted-foreground">
              Leave, visitor callbacks, and password resets
            </p>
          </div>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto p-3">
            {isOwner ? (
              <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Leave approvals
                </h4>
                {!leavePending.length ? (
                  <p className="text-xs text-muted-foreground">No pending leave requests.</p>
                ) : (
                  leavePending.map((r) => (
                    <div
                      key={String(r.id)}
                      className="rounded-xl border border-border px-3 py-2 text-sm"
                    >
                      <p className="font-medium">
                        {String(
                          r.userName ||
                            r.staffName ||
                            r.name ||
                            r.userId ||
                            r.staffId ||
                            "Staff",
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {String(r.startDate || r.fromDate || "").slice(0, 10)} →{" "}
                        {String(r.endDate || r.toDate || "").slice(0, 10)}
                        {r.type || r.leaveType ? ` · ${r.type || r.leaveType}` : ""}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setOpen(false);
                            router.push("/leave");
                          }}
                        >
                          Open Leave
                        </Button>
                        <Button
                          size="sm"
                          onClick={async () => {
                            try {
                              await leaveApi.update(String(r.id), { status: "Approved" });
                              toast.success("Leave approved");
                              await qc.invalidateQueries({ queryKey: ["settings"] });
                              await qc.invalidateQueries({ queryKey: ["leave"] });
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Approve failed");
                            }
                          }}
                        >
                          Approve
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </section>
            ) : null}

            {canVisitors ? (
              <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Visitor Call Back Alerts
                </h4>
                {!callbacks.length ? (
                  <p className="text-xs text-muted-foreground">
                    No callback reminders for today.
                  </p>
                ) : (
                  callbacks.map((v) => (
                    <div
                      key={v.id}
                      className="rounded-xl border border-amber-200/80 bg-amber-50/50 px-3 py-2 text-sm dark:border-amber-500/20 dark:bg-amber-950/20"
                    >
                      <p className="font-medium">Call {visitorName(v)} today</p>
                      <p className="text-xs text-muted-foreground">
                        {v.mobile || "—"} · Tentative join:{" "}
                        {String(v.tentativeJoiningDate || "").slice(0, 10)}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setOpen(false);
                            router.push("/members");
                          }}
                        >
                          Open Visitors
                        </Button>
                        <Button
                          size="sm"
                          onClick={async () => {
                            try {
                              const updated = {
                                ...v,
                                lastCalledAt: new Date().toISOString(),
                                lastCalledBy: user.name || user.id,
                              };
                              await visitorsApi.bulk([
                                updated,
                                ...visitors.filter((x) => x.id !== v.id),
                              ]);
                              toast.success("Visitor marked as called.");
                              await qc.invalidateQueries({ queryKey: ["visitors"] });
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Update failed");
                            }
                          }}
                        >
                          Mark as Called
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </section>
            ) : null}

            {canPwd ? (
              <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Password resets
                </h4>
                {!passwordResets.length ? (
                  <p className="text-xs text-muted-foreground">No pending password resets.</p>
                ) : (
                  passwordResets.map((u) => (
                    <div
                      key={u.id}
                      className="rounded-xl border border-border px-3 py-2 text-sm"
                    >
                      <p className="font-medium">{u.name || u.id}</p>
                      <p className="text-xs text-muted-foreground">{u.id}</p>
                      <Input
                        className="mt-2"
                        type="password"
                        placeholder="New password"
                        value={pwdDraft[u.id] || ""}
                        onChange={(e) =>
                          setPwdDraft((p) => ({ ...p, [u.id]: e.target.value }))
                        }
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setOpen(false);
                            router.push("/staff");
                          }}
                        >
                          Open Staff
                        </Button>
                        <Button
                          size="sm"
                          onClick={async () => {
                            const pwd = String(pwdDraft[u.id] || "").trim();
                            if (pwd.length < 4) {
                              toast.error("Enter a new password (min 4 chars)");
                              return;
                            }
                            try {
                              await adminSetPassword(u.id, pwd);
                              toast.success("Password reset approved");
                              setPwdDraft((p) => ({ ...p, [u.id]: "" }));
                              await qc.invalidateQueries({ queryKey: ["users"] });
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Approve failed");
                            }
                          }}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            try {
                              await rejectPasswordReset(u.id);
                              toast.success("Password reset rejected");
                              await qc.invalidateQueries({ queryKey: ["users"] });
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Reject failed");
                            }
                          }}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </section>
            ) : null}

            {!count ? (
              <p className={cn("py-4 text-center text-xs text-muted-foreground")}>
                You&apos;re all caught up.
              </p>
            ) : null}
          </div>
          <div className="border-t border-border px-3 py-2">
            <Button
              size="sm"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setOpen(false);
                setAddMemberOpen(false);
              }}
            >
              Close
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
