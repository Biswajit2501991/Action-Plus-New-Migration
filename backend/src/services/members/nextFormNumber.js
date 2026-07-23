import { getSupabase, gymId } from "../db/supabase/client.js";

/**
 * Next form number for a branch, skipping codes already used (including soft-deleted).
 */
export async function resolveNextMemberFormNumber({
  gymCodeId,
  branchToken = "",
  yearSuffix = "",
}) {
  const branchId = String(gymCodeId || "").trim();
  if (!branchId) {
    const err = new Error("gym-code-id-required");
    err.status = 400;
    throw err;
  }

  const year = String(yearSuffix || String(new Date().getFullYear()).slice(-2))
    .trim()
    .slice(-2);
  const token = String(branchToken || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "") || "BR";

  const sb = getSupabase();
  const gid = gymId();

  // Include soft-deleted rows so form numbers / member codes are never reused.
  const { data: rows, error } = await sb
    .from("members")
    .select("form_no, member_code, deleted_at")
    .eq("gym_id", gid)
    .eq("assigned_gym_code_id", branchId)
    .limit(5000);
  if (error) {
    const err = new Error(`next-form-number-failed: ${error.message}`);
    err.status = 500;
    throw err;
  }

  const usedFormNos = new Set();
  const usedCodes = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const formNo = Number(row.form_no);
    if (Number.isFinite(formNo) && formNo > 0) usedFormNos.add(Math.floor(formNo));
    const code = String(row.member_code || "").trim();
    if (code) usedCodes.add(code);
    // Also parse APG-{n}/{yy}-{branch} when form_no is missing.
    const m = code.match(/^APG-(\d+)\/(\d{2})-([A-Z0-9]+)$/i);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) usedFormNos.add(n);
    }
  }

  // Soft-deleted audit table may retain codes after hard cleanup of members.
  try {
    const { data: audited } = await sb
      .from("member_delete_audit")
      .select("member_code")
      .eq("gym_id", gid)
      .limit(5000);
    for (const row of Array.isArray(audited) ? audited : []) {
      const code = String(row.member_code || "").trim();
      if (code) usedCodes.add(code);
      const m = code.match(/^APG-(\d+)\/(\d{2})-([A-Z0-9]+)$/i);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > 0) usedFormNos.add(n);
      }
    }
  } catch {
    /* audit table optional */
  }

  let next = usedFormNos.size ? Math.max(...usedFormNos) + 1 : 1;
  for (let i = 0; i < 5000; i += 1) {
    const candidate = `APG-${next}/${year}-${token}`;
    if (!usedCodes.has(candidate) && !usedFormNos.has(next)) break;
    next += 1;
  }

  return {
    ok: true,
    formNo: next,
    memberId: `APG-${next}/${year}-${token}`,
    gymCodeId: branchId,
    branchToken: token,
    yearSuffix: year,
  };
}
