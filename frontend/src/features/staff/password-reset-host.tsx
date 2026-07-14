"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ClassicalModal } from "@/components/ui/classical-modal";
import { useUsers } from "@/hooks/use-data";
import {
  canViewPasswordResetNotifications,
  pendingPasswordResets,
} from "@/lib/domain/password-reset";
import { formatDate } from "@/lib/utils";
import { adminSetPassword, rejectPasswordReset } from "@/services/api/auth";
import { useAuthStore } from "@/stores";
import type { StaffUser } from "@/types";

export function PasswordResetHost() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const canView = canViewPasswordResetNotifications(user);
  const { data: users = [] } = useUsers();
  const pending = useMemo(
    () => (canView ? pendingPasswordResets(users) : []),
    [canView, users],
  );
  const [open, setOpen] = useState(false);
  const [approveFor, setApproveFor] = useState<StaffUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const approve = useMutation({
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

  const reject = useMutation({
    mutationFn: (staffId: string) => rejectPasswordReset(staffId),
    onSuccess: async () => {
      toast.success("Password reset rejected");
      await qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canView || !pending.length) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-9 items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/90 px-3 text-xs font-semibold text-amber-950 transition hover:bg-amber-100 dark:border-amber-500/25 dark:bg-amber-950/40 dark:text-amber-100"
        aria-label={`${pending.length} password reset requests`}
        data-testid="password-reset-bell"
      >
        <KeyRound className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Resets</span>
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-slate-900 px-1.5 text-[10px] font-bold text-white dark:bg-teal-400 dark:text-slate-950">
          {pending.length}
        </span>
      </button>

      {open ? (
        <div className="absolute right-4 top-14 z-[90] w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0f141c] sm:right-6">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/10">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Security
              </p>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                Password reset requests
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-white/5"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto p-3">
            {pending.map((staff) => (
              <div
                key={staff.id}
                className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/[0.03]"
              >
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-slate-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                      {staff.name || staff.id}
                    </p>
                    <p className="truncate text-[11px] text-slate-500">
                      {staff.email || staff.id} · requested{" "}
                      {formatDate(
                        String(
                          staff.passwordResetRequestedAt ||
                            staff.password_reset_requested_at ||
                            "",
                        ),
                      )}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        className="h-7 flex-1 bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
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
                        disabled={reject.isPending}
                        onClick={() => {
                          if (
                            confirm(
                              `Reject password reset for ${staff.name || staff.id}?`,
                            )
                          ) {
                            reject.mutate(staff.id);
                          }
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
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
              onClick={() => approve.mutate()}
              disabled={approve.isPending}
              className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300"
            >
              {approve.isPending ? "Saving…" : "Approve & set password"}
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
    </>
  );
}
