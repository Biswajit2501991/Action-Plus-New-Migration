/**
 * Spin & Win storage. A spin writes a play and a coupon.
 * It does not write payments, member amounts, or WhatsApp.
 */

import crypto from "node:crypto";
import { getSupabase, gymId } from "../../db/supabase/client.js";
import {
  defaultCampaign,
  defaultSegments,
  isCampaignLive,
  normalizeCampaign,
  pickSegmentIndex,
  planAllowed,
  publicSegments,
} from "./spinWheelRules.js";

function rowToCampaign(row) {
  const base = defaultCampaign();
  return {
    id: row.id,
    ...base,
    enabled: Boolean(row.enabled),
    showWebsite: Boolean(row.show_website),
    showMemberPortal: Boolean(row.show_member_portal),
    showGymManager: Boolean(row.show_gym_manager),
    title: row.title || base.title,
    subtitle: row.subtitle || base.subtitle,
    buttonLabel: row.button_label || base.buttonLabel,
    minDiscount: row.min_discount,
    maxDiscount: row.max_discount,
    segments: Array.isArray(row.segments) && row.segments.length ? row.segments : base.segments,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    audience: row.audience || "all",
    eligiblePlans: Array.isArray(row.eligible_plans) ? row.eligible_plans : [],
    popupDelaySec: row.popup_delay_sec,
    closeOverlay: row.close_overlay !== false,
    cooldownHours: row.cooldown_hours,
    spinsPerPerson: row.spins_per_person,
    couponExpiryDays: row.coupon_expiry_days,
    allowStack: Boolean(row.allow_stack),
    branchOverrides: row.branch_overrides && typeof row.branch_overrides === "object" ? row.branch_overrides : {},
  };
}

function campaignToRow(gym, value) {
  return {
    gym_id: gym,
    enabled: value.enabled,
    show_website: value.showWebsite,
    show_member_portal: value.showMemberPortal,
    show_gym_manager: value.showGymManager,
    title: value.title,
    subtitle: value.subtitle,
    button_label: value.buttonLabel,
    min_discount: value.minDiscount,
    max_discount: value.maxDiscount,
    segments: value.segments,
    starts_at: value.startsAt,
    ends_at: value.endsAt,
    audience: value.audience,
    eligible_plans: value.eligiblePlans,
    popup_delay_sec: value.popupDelaySec,
    close_overlay: value.closeOverlay,
    cooldown_hours: value.cooldownHours,
    spins_per_person: value.spinsPerPerson,
    coupon_expiry_days: value.couponExpiryDays,
    allow_stack: value.allowStack,
    branch_overrides: value.branchOverrides,
    updated_at: new Date().toISOString(),
  };
}

async function loadRow() {
  const sb = getSupabase();
  const { data, error } = await sb.from("spin_campaigns").select("*").eq("gym_id", gymId()).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getSpinCampaign({ create = false } = {}) {
  const existing = await loadRow();
  if (existing) return rowToCampaign(existing);
  if (!create) return null;
  const value = defaultCampaign();
  value.segments = defaultSegments();
  const sb = getSupabase();
  const { data, error } = await sb
    .from("spin_campaigns")
    .insert(campaignToRow(gymId(), value))
    .select("*")
    .single();
  if (error) throw error;
  return rowToCampaign(data);
}

export async function saveSpinCampaign(input) {
  const current = await getSpinCampaign({ create: true });
  const normalized = normalizeCampaign(input, current);
  if (!normalized.ok) return { ok: false, status: 400, errors: normalized.errors };
  const sb = getSupabase();
  const { data, error } = await sb
    .from("spin_campaigns")
    .update(campaignToRow(gymId(), normalized.value))
    .eq("id", current.id)
    .select("*")
    .single();
  if (error) throw error;
  return { ok: true, campaign: rowToCampaign(data) };
}

export function livePayload(campaign, query) {
  if (!campaign || !isCampaignLive(campaign, query)) return { ok: true, active: false };
  return {
    ok: true,
    active: true,
    title: campaign.title,
    subtitle: campaign.subtitle,
    buttonLabel: campaign.buttonLabel,
    segments: publicSegments(campaign.segments),
    closeOverlay: campaign.closeOverlay,
    cooldownHours: campaign.cooldownHours,
    popupDelaySec: campaign.popupDelaySec,
    allowStack: campaign.allowStack,
  };
}

export async function publicSpinConfig(query) {
  const campaign = await getSpinCampaign();
  return livePayload(campaign, query);
}

export async function spinWheel(input, depth = 0) {
  const campaign = await getSpinCampaign();
  if (!campaign || !isCampaignLive(campaign, input)) {
    return { ok: false, status: 403, error: "inactive" };
  }
  if (!planAllowed(campaign, input.planName, input.surface)) {
    return { ok: false, status: 403, error: "plan" };
  }
  const participantKey = String(input.participantKey || "").trim();
  if (!participantKey || participantKey.length > 180) {
    return { ok: false, status: 400, error: "missing-person" };
  }
  const sb = getSupabase();
  const gid = gymId();
  const { data: existing, error: existingError } = await sb
    .from("spin_plays")
    .select("id, discount, segment_index, attempt_no")
    .eq("gym_id", gid)
    .eq("campaign_id", campaign.id)
    .eq("participant_key", participantKey)
    .order("attempt_no", { ascending: false });
  if (existingError) throw existingError;
  const prior = existing || [];
  if (prior.length >= campaign.spinsPerPerson) {
    const coupon = await couponForPlay(prior[0].id);
    return {
      ok: true,
      alreadyUsed: true,
      segmentIndex: prior[0].segment_index,
      discount: prior[0].discount,
      label: `${prior[0].discount}%`,
      couponCode: coupon?.code || null,
      expiresAt: coupon?.expires_at || null,
    };
  }
  const segmentIndex = pickSegmentIndex(campaign.segments);
  const segment = campaign.segments[segmentIndex];
  const { data: play, error: playError } = await sb
    .from("spin_plays")
    .insert({
      gym_id: gid,
      campaign_id: campaign.id,
      surface: input.surface,
      participant_key: participantKey,
      attempt_no: prior.length + 1,
      member_uuid: input.memberUuid || null,
      member_code: input.memberCode || null,
      branch_id: input.branchId || null,
      discount: segment.discount,
      segment_index: segmentIndex,
    })
    .select("id")
    .single();
  if (playError) {
    if (playError.code === "23505" && depth < 3) return spinWheel(input, depth + 1);
    throw playError;
  }
  const coupon = await insertCoupon({
    campaign,
    playId: play.id,
    participantKey,
    discount: segment.discount,
    memberUuid: input.memberUuid,
    branchId: input.branchId,
    planName: input.planName,
  });
  if (!coupon) {
    await sb.from("spin_plays").delete().eq("id", play.id);
    return { ok: false, status: 500, error: "coupon-failed" };
  }
  return {
    ok: true,
    segmentIndex,
    discount: segment.discount,
    label: `${segment.discount}%`,
    couponCode: coupon.code,
    expiresAt: coupon.expires_at,
  };
}

async function insertCoupon({ campaign, playId, participantKey, discount, memberUuid, branchId, planName }) {
  const sb = getSupabase();
  const expires = new Date(Date.now() + campaign.couponExpiryDays * 24 * 60 * 60 * 1000).toISOString();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const code = `APG-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const { data, error } = await sb
      .from("spin_coupons")
      .insert({
        gym_id: gymId(),
        campaign_id: campaign.id,
        play_id: playId,
        code,
        discount,
        participant_key: participantKey,
        member_uuid: memberUuid || null,
        branch_id: branchId || null,
        plan_name: planName || null,
        status: "issued",
        expires_at: expires,
      })
      .select("code, expires_at")
      .single();
    if (!error) return data;
    if (error.code !== "23505") throw error;
  }
  return null;
}

async function couponForPlay(playId) {
  const sb = getSupabase();
  const { data } = await sb
    .from("spin_coupons")
    .select("code, expires_at, status, discount")
    .eq("play_id", playId)
    .maybeSingle();
  return data;
}

export async function lookupSpinCoupon(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return { ok: false, status: 400, error: "missing-code" };
  const sb = getSupabase();
  const { data, error } = await sb
    .from("spin_coupons")
    .select("code, discount, status, expires_at, redeemed_at, branch_id, plan_name, campaign_id")
    .eq("gym_id", gymId())
    .eq("code", normalized)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, status: 404, error: "not-found" };
  const campaign = await getSpinCampaign();
  const expired = new Date(data.expires_at).getTime() < Date.now();
  return {
    ok: true,
    coupon: {
      code: data.code,
      discount: data.discount,
      status: expired && data.status === "issued" ? "expired" : data.status,
      expiresAt: data.expires_at,
      redeemedAt: data.redeemed_at,
      branchId: data.branch_id,
      planName: data.plan_name,
      eligiblePlans: campaign?.eligiblePlans || [],
      allowStack: Boolean(campaign?.allowStack),
    },
  };
}

export async function redeemSpinCoupon(code, staffLogin) {
  const found = await lookupSpinCoupon(code);
  if (!found.ok) return found;
  if (found.coupon.status === "redeemed") return { ok: false, status: 409, error: "already-redeemed", coupon: found.coupon };
  if (found.coupon.status === "expired") return { ok: false, status: 409, error: "expired", coupon: found.coupon };
  const sb = getSupabase();
  const { data, error } = await sb
    .from("spin_coupons")
    .update({
      status: "redeemed",
      redeemed_at: new Date().toISOString(),
      redeemed_by: String(staffLogin || "").slice(0, 80),
    })
    .eq("gym_id", gymId())
    .eq("code", found.coupon.code)
    .eq("status", "issued")
    .select("code, discount, status, expires_at, redeemed_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, status: 409, error: "already-redeemed" };
  return { ok: true, coupon: { ...found.coupon, status: "redeemed", redeemedAt: data.redeemed_at } };
}

export async function spinReport({ from, to, branchId }) {
  const campaign = await getSpinCampaign();
  if (!campaign) {
    return { ok: true, spins: 0, people: 0, issued: 0, redeemed: 0, discountTotal: 0, byDiscount: [] };
  }
  const sb = getSupabase();
  const gid = gymId();
  let playsQuery = sb
    .from("spin_plays")
    .select("participant_key, discount, branch_id, created_at")
    .eq("gym_id", gid)
    .eq("campaign_id", campaign.id)
    .limit(5000);
  let couponsQuery = sb
    .from("spin_coupons")
    .select("status, discount, branch_id, created_at, redeemed_at")
    .eq("gym_id", gid)
    .eq("campaign_id", campaign.id)
    .limit(5000);
  if (from) {
    playsQuery = playsQuery.gte("created_at", from);
    couponsQuery = couponsQuery.gte("created_at", from);
  }
  if (to) {
    playsQuery = playsQuery.lte("created_at", to);
    couponsQuery = couponsQuery.lte("created_at", to);
  }
  if (branchId) {
    playsQuery = playsQuery.eq("branch_id", branchId);
    couponsQuery = couponsQuery.eq("branch_id", branchId);
  }
  const [playsRes, couponsRes] = await Promise.all([playsQuery, couponsQuery]);
  if (playsRes.error) throw playsRes.error;
  if (couponsRes.error) throw couponsRes.error;
  const plays = playsRes.data || [];
  const coupons = couponsRes.data || [];
  const byDiscount = new Map();
  for (const play of plays) {
    byDiscount.set(play.discount, (byDiscount.get(play.discount) || 0) + 1);
  }
  const redeemed = coupons.filter((coupon) => coupon.status === "redeemed");
  return {
    ok: true,
    spins: plays.length,
    people: new Set(plays.map((play) => play.participant_key)).size,
    issued: coupons.length,
    redeemed: redeemed.length,
    discountTotal: redeemed.reduce((sum, coupon) => sum + Number(coupon.discount || 0), 0),
    byDiscount: [...byDiscount.entries()]
      .map(([discount, count]) => ({ discount, count }))
      .sort((a, b) => a.discount - b.discount),
  };
}
