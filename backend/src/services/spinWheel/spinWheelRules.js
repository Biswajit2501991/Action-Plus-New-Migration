/**
 * Pure rules for Spin & Win. The server picks the slice. The client only animates.
 */

import crypto from "node:crypto";

export const SPIN_SURFACES = ["website", "member_portal", "gym_manager"];

export function defaultSegments(min = 5, max = 10, count = 6) {
  const lo = clampInt(min, 1, 100, 5);
  const hi = clampInt(max, lo, 100, 10);
  const n = clampInt(count, 2, 12, 6);
  const segments = [];
  for (let i = 0; i < n; i += 1) {
    const discount = n === 1 ? lo : lo + Math.round(((hi - lo) * i) / (n - 1));
    segments.push({ label: `${discount}%`, discount, weight: 1 });
  }
  return segments;
}

export function defaultCampaign() {
  return {
    enabled: false,
    showWebsite: false,
    showMemberPortal: false,
    showGymManager: false,
    title: "Spin & Win",
    subtitle: "Spin for a membership discount",
    buttonLabel: "SPIN",
    minDiscount: 5,
    maxDiscount: 10,
    segments: defaultSegments(5, 10, 6),
    startsAt: null,
    endsAt: null,
    audience: "all",
    eligiblePlans: [],
    popupDelaySec: 2,
    closeOverlay: true,
    cooldownHours: 24,
    spinsPerPerson: 1,
    couponExpiryDays: 14,
    allowStack: false,
    branchOverrides: {},
  };
}

export function normalizeCampaign(input, fallback = defaultCampaign()) {
  const base = fallback || defaultCampaign();
  const errors = [];
  const minDiscount = clampInt(input?.minDiscount, 1, 100, base.minDiscount);
  const maxDiscount = clampInt(input?.maxDiscount, 1, 100, base.maxDiscount);
  if (minDiscount > maxDiscount) {
    errors.push("The minimum discount cannot be above the maximum.");
  }
  const rawSegments = Array.isArray(input?.segments) ? input.segments : base.segments;
  const segments = rawSegments.slice(0, 12).map((segment) => {
    const discount = clampInt(segment?.discount, 0, 100, 0);
    const weight = clampInt(segment?.weight, 1, 1000, 1);
    return { label: `${discount}%`, discount, weight };
  });
  if (segments.length < 2) errors.push("Add at least two slices.");
  if (segments.length > 12) errors.push("Use at most 12 slices.");
  for (const segment of segments) {
    if (segment.discount < minDiscount || segment.discount > maxDiscount) {
      errors.push(`Each slice must stay between ${minDiscount}% and ${maxDiscount}%.`);
      break;
    }
  }
  const audience = ["all", "members", "visitors"].includes(input?.audience)
    ? input.audience
    : base.audience;
  const plans = Array.isArray(input?.eligiblePlans)
    ? [
        ...new Set(
          input.eligiblePlans
            .map((plan) => String(plan || "").trim())
            .filter(Boolean)
            .slice(0, 20),
        ),
      ]
    : base.eligiblePlans;
  const startsAt = cleanDate(input?.startsAt);
  const endsAt = cleanDate(input?.endsAt);
  if (startsAt && endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
    errors.push("The end date must be on or after the start date.");
  }
  const title = clipText(input?.title, 60) || base.title;
  const subtitle = clipText(input?.subtitle, 140) || base.subtitle;
  const buttonLabel = clipText(input?.buttonLabel, 16) || "SPIN";
  const branchOverrides = {};
  const rawBranches =
    input?.branchOverrides && typeof input.branchOverrides === "object"
      ? input.branchOverrides
      : {};
  for (const [id, row] of Object.entries(rawBranches).slice(0, 40)) {
    const key = String(id || "").trim();
    if (!key) continue;
    branchOverrides[key] = { enabled: row?.enabled !== false };
  }
  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    value: {
      enabled: Boolean(input?.enabled),
      showWebsite: Boolean(input?.showWebsite),
      showMemberPortal: Boolean(input?.showMemberPortal),
      showGymManager: Boolean(input?.showGymManager),
      title,
      subtitle,
      buttonLabel,
      minDiscount,
      maxDiscount,
      segments,
      startsAt,
      endsAt,
      audience,
      eligiblePlans: plans,
      popupDelaySec: clampInt(input?.popupDelaySec, 0, 30, 2),
      closeOverlay: input?.closeOverlay !== false,
      cooldownHours: clampInt(input?.cooldownHours, 1, 720, 24),
      spinsPerPerson: clampInt(input?.spinsPerPerson, 1, 10, 1),
      couponExpiryDays: clampInt(input?.couponExpiryDays, 1, 365, 14),
      allowStack: Boolean(input?.allowStack),
      branchOverrides,
    },
  };
}

export function pickSegmentIndex(segments, randomInt = crypto.randomInt) {
  const weights = (segments || []).map((segment) => Math.max(0, Number(segment?.weight) || 0));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!weights.length || total <= 0) return 0;
  const roll = randomInt(0, total);
  let cursor = 0;
  for (let i = 0; i < weights.length; i += 1) {
    cursor += weights[i];
    if (roll < cursor) return i;
  }
  return weights.length - 1;
}

export function isCampaignLive(campaign, { surface, branchId, audienceKind, now = new Date() } = {}) {
  if (!campaign?.enabled) return false;
  if (!SPIN_SURFACES.includes(surface)) return false;
  if (surface === "website" && !campaign.showWebsite) return false;
  if (surface === "member_portal" && !campaign.showMemberPortal) return false;
  if (surface === "gym_manager" && !campaign.showGymManager) return false;
  if (campaign.startsAt && new Date(campaign.startsAt).getTime() > now.getTime()) return false;
  if (campaign.endsAt && new Date(campaign.endsAt).getTime() < now.getTime()) return false;
  if (!branchAllows(campaign.branchOverrides, branchId)) return false;
  if (!audienceAllows(campaign.audience, audienceKind, surface)) return false;
  return true;
}

export function planAllowed(campaign, planName, surface) {
  const plans = Array.isArray(campaign?.eligiblePlans) ? campaign.eligiblePlans : [];
  if (!plans.length || surface !== "member_portal") return true;
  const name = String(planName || "").trim().toLowerCase();
  if (!name) return false;
  return plans.some((plan) => String(plan).trim().toLowerCase() === name);
}

export function publicSegments(segments) {
  return (segments || []).map((segment) => ({
    label: `${segment.discount}%`,
    discount: segment.discount,
  }));
}

export function rotationForSegment(index, count, turns = 5) {
  const n = Math.max(1, count);
  const slice = 360 / n;
  const center = (index + 0.5) * slice;
  return turns * 360 - center;
}

function branchAllows(overrides, branchId) {
  const map = overrides && typeof overrides === "object" ? overrides : {};
  const id = String(branchId || "").trim();
  if (!id) {
    const rows = Object.values(map);
    if (!rows.length) return true;
    return rows.some((row) => row?.enabled !== false);
  }
  const row = map[id];
  if (!row) return true;
  return row.enabled !== false;
}

function audienceAllows(audience, kind, surface) {
  if (surface === "gym_manager") return true;
  if (audience === "members") return kind === "member";
  if (audience === "visitors") return kind === "visitor";
  return true;
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function cleanDate(value) {
  if (value == null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function clipText(value, max) {
  return String(value || "")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .slice(0, max);
}
