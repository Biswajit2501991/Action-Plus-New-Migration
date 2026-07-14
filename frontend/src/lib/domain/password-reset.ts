import type { AuthUser, StaffUser } from "@/types";
import { isBranchAdminUser, isMasterOwnerUser } from "@/lib/domain/permissions";

export const PASSWORD_RESET_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
} as const;

function toMs(value: unknown) {
  if (!value) return NaN;
  const ms = new Date(String(value)).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

export function passwordResetStatusFromRecord(record?: StaffUser | null) {
  if (!record) return "";
  const requestedAt =
    record.passwordResetRequestedAt || record.password_reset_requested_at || "";
  const approvedAt =
    record.passwordResetApprovedAt || record.password_reset_approved_at || "";
  const rejectedAt =
    record.passwordResetRejectedAt || record.password_reset_rejected_at || "";

  if (!requestedAt) {
    if (rejectedAt && !approvedAt) return PASSWORD_RESET_STATUS.REJECTED;
    return "";
  }

  const reqMs = toMs(requestedAt);
  if (!Number.isFinite(reqMs)) return "";

  const appMs = toMs(approvedAt);
  const rejMs = toMs(rejectedAt);

  if (Number.isFinite(appMs) && appMs >= reqMs) return PASSWORD_RESET_STATUS.APPROVED;
  if (Number.isFinite(rejMs) && rejMs >= reqMs) return PASSWORD_RESET_STATUS.REJECTED;
  return PASSWORD_RESET_STATUS.PENDING;
}

export function isPasswordResetPendingUser(user?: StaffUser | null) {
  if (!user) return false;
  if (String(user.id || "").trim().toLowerCase() === "owner") return false;
  if (String(user.passwordResetStatus || "") === PASSWORD_RESET_STATUS.PENDING) return true;
  return passwordResetStatusFromRecord(user) === PASSWORD_RESET_STATUS.PENDING;
}

export function canViewPasswordResetNotifications(user?: AuthUser | null) {
  if (!user?.id) return false;
  if (isMasterOwnerUser(user) || isBranchAdminUser(user)) return true;
  const role = String(user.staffRole || user.role || "")
    .trim()
    .toLowerCase();
  return role === "owner" || role === "master_owner" || role === "branch_owner";
}

export function pendingPasswordResets(users: StaffUser[]) {
  return (users || [])
    .filter(isPasswordResetPendingUser)
    .sort((a, b) => {
      const aMs = toMs(a.passwordResetRequestedAt || a.password_reset_requested_at);
      const bMs = toMs(b.passwordResetRequestedAt || b.password_reset_requested_at);
      return (bMs || 0) - (aMs || 0);
    });
}
