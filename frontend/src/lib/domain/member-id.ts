import type { GymCode, Member } from "@/types";

function toPositiveInt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export function nextBranchFormNumber(members: Member[], gymCodeId?: string | null) {
  const branchId = String(gymCodeId || "").trim();
  const nums = (Array.isArray(members) ? members : [])
    .filter((m) => String(m?.assignedGymCodeId || "").trim() === branchId)
    .map((m) => toPositiveInt(m?.formNo))
    .filter((n): n is number => n != null);
  const max = nums.length ? Math.max(...nums) : 0;
  return max + 1;
}

export function branchCodeToken(gymCodes: GymCode[], gymCodeId?: string | null) {
  const branchId = String(gymCodeId || "").trim();
  const row = (Array.isArray(gymCodes) ? gymCodes : []).find((c) => String(c?.id || "") === branchId);
  const raw = String(row?.code || "").trim().toUpperCase();
  const safe = raw.replace(/[^A-Z0-9]/g, "");
  return safe || "BR";
}

export function buildBranchMemberId(formNo: string | number, yearSuffix: string, branchToken: string) {
  const safeNo = String(formNo || "").trim();
  const safeYear = String(yearSuffix || "").trim();
  const safeBranch = String(branchToken || "").trim().toUpperCase() || "BR";
  return `APG-${safeNo}/${safeYear}-${safeBranch}`;
}

export function gymCodeLabel(gymCodes: GymCode[], gymCodeId?: string | null) {
  const branchId = String(gymCodeId || "").trim();
  const row = (Array.isArray(gymCodes) ? gymCodes : []).find((c) => String(c?.id || "") === branchId);
  if (!row) return branchId || "—";
  return `${row.code || "—"} / ${row.name || row.label || "Branch"}`;
}
