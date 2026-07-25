import type { StaffUser } from "@/types";

/** Human-readable staff role for header / profile UI (prod parity). */
export function staffRoleDisplayLabel(user?: StaffUser | null) {
  if (!user) return "Staff";
  const id = String(user.id || "").trim().toLowerCase();
  const role = String(user.staffRole || user.role || "staff")
    .trim()
    .toLowerCase();
  if (id === "owner" || role === "owner" || role === "master_owner") return "Master Owner";
  if (role === "branch_owner") return "Branch Owner";
  return "Staff";
}
