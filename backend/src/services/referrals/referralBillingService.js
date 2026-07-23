import { getSupabase, gymId } from "../../db/supabase/client.js";
import {
  REFERRER_CREDIT_INR,
  NEW_MEMBER_JOIN_DISCOUNT_INR,
  normalizeReferralCode,
  isAllowedReferrerStatus,
} from "../../lib/referralBilling.js";

function err(message, status = 400, extra = {}) {
  const e = new Error(message);
  e.status = status;
  Object.assign(e, extra);
  return e;
}

async function loadMemberByCodeOrUuid(sb, gid, key) {
  const id = String(key || "").trim();
  if (!id) return null;
  if (/^[0-9a-f-]{36}$/i.test(id)) {
    const { data } = await sb
      .from("members")
      .select(
        "id, member_uuid, member_code, full_name, status, deleted_at",
      )
      .eq("gym_id", gid)
      .eq("member_uuid", id)
      .is("deleted_at", null)
      .maybeSingle();
    return data || null;
  }
  const { data } = await sb
    .from("members")
    .select(
      "id, member_uuid, member_code, full_name, status, deleted_at",
    )
    .eq("gym_id", gid)
    .eq("member_code", id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

/**
 * Resolve a portal referral code to an Active/Hold referrer.
 */
export async function lookupReferralCode(rawCode) {
  const code = normalizeReferralCode(rawCode);
  if (!code || code.length < 4) {
    throw err("invalid-referral-code", 400);
  }
  const sb = getSupabase();
  const gid = gymId();

  const { data: row, error } = await sb
    .from("member_referral_codes")
    .select("code, points, member_uuid")
    .eq("gym_id", gid)
    .eq("code", code)
    .maybeSingle();
  if (error) throw err(`referral-lookup-failed: ${error.message}`, 500);
  let resolved = row;
  if (!resolved?.member_uuid) {
    // Case-insensitive fallback (older rows / pasted whitespace variants).
    const { data: fuzzy, error: fuzzyErr } = await sb
      .from("member_referral_codes")
      .select("code, points, member_uuid")
      .eq("gym_id", gid)
      .ilike("code", code)
      .limit(5);
    if (fuzzyErr) throw err(`referral-lookup-failed: ${fuzzyErr.message}`, 500);
    resolved = (Array.isArray(fuzzy) ? fuzzy : []).find(
      (r) => normalizeReferralCode(r.code) === code,
    ) || null;
  }
  if (!resolved?.member_uuid) throw err("referral-code-not-found", 404);

  const { data: member, error: mErr } = await sb
    .from("members")
    .select("member_uuid, member_code, full_name, status, deleted_at")
    .eq("gym_id", gid)
    .eq("member_uuid", resolved.member_uuid)
    .is("deleted_at", null)
    .maybeSingle();
  if (mErr) throw err(`referral-lookup-failed: ${mErr.message}`, 500);
  if (!member) throw err("referral-code-not-found", 404);
  if (!isAllowedReferrerStatus(member.status)) {
    throw err("referrer-not-eligible", 403, {
      detail: "Only Active or Hold members can refer.",
    });
  }

  return {
    ok: true,
    code: String(resolved.code || code).toUpperCase(),
    points: Number(resolved.points || 0) || 0,
    referrer: {
      memberUuid: member.member_uuid,
      memberCode: member.member_code,
      fullName: member.full_name,
      status: member.status,
    },
    joinDiscountInr: NEW_MEMBER_JOIN_DISCOUNT_INR,
    referrerCreditInr: REFERRER_CREDIT_INR,
  };
}

/**
 * Pending referral credit total for a member (referrer).
 */
export async function getPendingReferralCredits(memberIdOrUuid) {
  const sb = getSupabase();
  const gid = gymId();
  const member = await loadMemberByCodeOrUuid(sb, gid, memberIdOrUuid);
  if (!member?.member_uuid) {
    throw err("member-not-found", 404);
  }

  const { data: events, error } = await sb
    .from("member_referral_events")
    .select(
      "id, referrer_credit_inr, referrer_credit_status, code_used, referred_uuid, created_at, note",
    )
    .eq("gym_id", gid)
    .eq("referrer_uuid", member.member_uuid)
    .eq("referrer_credit_status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw err(`referral-credits-failed: ${error.message}`, 500);

  const list = Array.isArray(events) ? events : [];
  const pendingCreditInr = list.reduce(
    (sum, e) => sum + (Number(e.referrer_credit_inr) || 0),
    0,
  );

  const { data: asReferred } = await sb
    .from("member_referral_events")
    .select("code_used, admission_discount_inr, referrer_uuid, created_at")
    .eq("gym_id", gid)
    .eq("referred_uuid", member.member_uuid)
    .neq("referrer_credit_status", "void")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    ok: true,
    memberUuid: member.member_uuid,
    memberCode: member.member_code,
    pendingCreditInr,
    pendingEvents: list.map((e) => ({
      id: e.id,
      creditInr: Number(e.referrer_credit_inr) || 0,
      codeUsed: e.code_used || null,
      referredUuid: e.referred_uuid || null,
      createdAt: e.created_at,
    })),
    referredBy: asReferred
      ? {
          code: asReferred.code_used || null,
          admissionDiscountInr: Number(asReferred.admission_discount_inr) || 0,
          referrerUuid: asReferred.referrer_uuid,
          createdAt: asReferred.created_at,
        }
      : null,
  };
}

/**
 * Award referral after new member create. Does not change either member's amount.
 */
export async function applyMemberReferral(referredMemberIdOrUuid, rawCode) {
  const code = normalizeReferralCode(rawCode);
  if (!code) throw err("invalid-referral-code", 400);

  const lookup = await lookupReferralCode(code);
  const sb = getSupabase();
  const gid = gymId();
  const referred = await loadMemberByCodeOrUuid(sb, gid, referredMemberIdOrUuid);
  if (!referred?.member_uuid) throw err("member-not-found", 404);
  if (!isAllowedReferrerStatus(referred.status)) {
    // New admission should be Active; still allow Hold.
    throw err("referred-member-not-eligible", 403);
  }
  if (referred.member_uuid === lookup.referrer.memberUuid) {
    throw err("self-referral-not-allowed", 400);
  }

  const { data: existing } = await sb
    .from("member_referral_events")
    .select("id, referrer_credit_status")
    .eq("gym_id", gid)
    .eq("referred_uuid", referred.member_uuid)
    .neq("referrer_credit_status", "void")
    .maybeSingle();
  if (existing?.id) {
    return {
      ok: true,
      duplicate: true,
      eventId: existing.id,
      referrerCreditInr: REFERRER_CREDIT_INR,
      admissionDiscountInr: NEW_MEMBER_JOIN_DISCOUNT_INR,
      referrer: lookup.referrer,
      code: lookup.code,
    };
  }

  const note = `Referral ${lookup.code}: +₹${REFERRER_CREDIT_INR} pending for ${lookup.referrer.memberCode}; join collect −₹${NEW_MEMBER_JOIN_DISCOUNT_INR} for ${referred.member_code}`;
  const { data: inserted, error: insErr } = await sb
    .from("member_referral_events")
    .insert({
      gym_id: gid,
      referrer_uuid: lookup.referrer.memberUuid,
      referred_uuid: referred.member_uuid,
      points: REFERRER_CREDIT_INR,
      note,
      code_used: lookup.code,
      referrer_credit_inr: REFERRER_CREDIT_INR,
      admission_discount_inr: NEW_MEMBER_JOIN_DISCOUNT_INR,
      referrer_credit_status: "pending",
    })
    .select("id")
    .maybeSingle();
  if (insErr) {
    if (/member_referral_events_gym_referred_active_uidx|duplicate key/i.test(String(insErr.message || ""))) {
      return {
        ok: true,
        duplicate: true,
        referrerCreditInr: REFERRER_CREDIT_INR,
        admissionDiscountInr: NEW_MEMBER_JOIN_DISCOUNT_INR,
        referrer: lookup.referrer,
        code: lookup.code,
      };
    }
    throw err(`referral-apply-failed: ${insErr.message}`, 500);
  }

  // Portal points display — append-only increment, never wipe.
  const { data: codeRow } = await sb
    .from("member_referral_codes")
    .select("points")
    .eq("gym_id", gid)
    .eq("member_uuid", lookup.referrer.memberUuid)
    .maybeSingle();
  const nextPoints = (Number(codeRow?.points) || 0) + REFERRER_CREDIT_INR;
  await sb
    .from("member_referral_codes")
    .update({ points: nextPoints })
    .eq("gym_id", gid)
    .eq("member_uuid", lookup.referrer.memberUuid);

  return {
    ok: true,
    duplicate: false,
    eventId: inserted?.id || null,
    referrerCreditInr: REFERRER_CREDIT_INR,
    admissionDiscountInr: NEW_MEMBER_JOIN_DISCOUNT_INR,
    referrer: lookup.referrer,
    code: lookup.code,
    points: nextPoints,
  };
}

/**
 * Mark all pending referrer credits applied after a payment is recorded.
 * Does not change members.amount. Returns credit total applied.
 */
export async function applyPendingReferralCreditsOnPayment({
  memberUuid,
  paymentId,
  memberCode,
}) {
  const uuid = String(memberUuid || "").trim();
  const pid = String(paymentId || "").trim();
  if (!uuid || !pid) return { appliedCreditInr: 0, appliedEventIds: [] };

  const sb = getSupabase();
  const gid = gymId();
  const { data: pending, error } = await sb
    .from("member_referral_events")
    .select("id, referrer_credit_inr")
    .eq("gym_id", gid)
    .eq("referrer_uuid", uuid)
    .eq("referrer_credit_status", "pending");
  if (error || !Array.isArray(pending) || !pending.length) {
    return { appliedCreditInr: 0, appliedEventIds: [] };
  }

  const ids = pending.map((e) => e.id).filter(Boolean);
  const appliedCreditInr = pending.reduce(
    (sum, e) => sum + (Number(e.referrer_credit_inr) || 0),
    0,
  );
  const now = new Date().toISOString();
  const { error: updErr } = await sb
    .from("member_referral_events")
    .update({
      referrer_credit_status: "applied",
      applied_payment_id: pid,
      applied_at: now,
      note: `Referral credit ₹${appliedCreditInr} applied on payment ${pid}${memberCode ? ` (${memberCode})` : ""}`,
    })
    .eq("gym_id", gid)
    .eq("referrer_uuid", uuid)
    .eq("referrer_credit_status", "pending")
    .in("id", ids);
  if (updErr) {
    console.error("applyPendingReferralCreditsOnPayment", updErr);
    return { appliedCreditInr: 0, appliedEventIds: [] };
  }
  return { appliedCreditInr, appliedEventIds: ids };
}
