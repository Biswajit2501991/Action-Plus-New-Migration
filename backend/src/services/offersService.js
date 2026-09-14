/**
 * Partner Offers — read-only member verify + append-only redemption log.
 * Does not write members, payments, or Finance.
 */

import { T } from '../db/tables.js';
import { getSupabase, gymId } from '../db/supabase/client.js';
import { authIsMasterOwner, resolveAllowedBranchIds } from '../auth/tenant/scopedAuth.js';
import { createMemberPhotoSignedUrl } from '../services/memberPhoto/MemberPhotoStorageManager.js';
import { memberPhotosStorageReady } from '../services/memberPhoto/memberPhotoSchema.js';

const DEFAULT_ELIGIBLE = ['Active', 'Hold'];

function digitsOnly(raw) {
  return String(raw || '').replace(/\D/g, '');
}

function normalizeMobile(raw) {
  let d = digitsOnly(raw);
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 15);
}

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

export function computeCustomerPay(totalCost, offerPercent) {
  const cost = Number(totalCost);
  const pct = Number(offerPercent);
  if (!Number.isFinite(cost) || cost < 0) {
    const err = new Error('Total cost must be 0 or more.');
    err.status = 400;
    throw err;
  }
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    const err = new Error('Offer % must be between 0 and 100.');
    err.status = 400;
    throw err;
  }
  return roundMoney(cost * (1 - pct / 100));
}

async function loadEligibleStatuses(sb, gid) {
  const { data } = await sb
    .from('settings_app_config')
    .select('config_json')
    .eq('gym_id', gid)
    .maybeSingle();
  const cfg =
    data?.config_json && typeof data.config_json === 'object' ? data.config_json : {};
  const list = Array.isArray(cfg.offerEligibleStatuses)
    ? cfg.offerEligibleStatuses.map((s) => String(s || '').trim()).filter(Boolean)
    : [];
  return list.length ? list : [...DEFAULT_ELIGIBLE];
}

export async function getOfferSettings(auth) {
  const sb = getSupabase();
  const gid = gymId();
  const eligibleStatuses = await loadEligibleStatuses(sb, gid);
  return { eligibleStatuses, defaults: DEFAULT_ELIGIBLE };
}

export async function saveOfferEligibleStatuses(auth, statusesRaw) {
  if (!authIsMasterOwner(auth) && !auth?.access?.__owner) {
    // Also allow settings.manageSystemFeatures via route gate
  }
  const sb = getSupabase();
  const gid = gymId();
  const statuses = Array.isArray(statusesRaw)
    ? [...new Set(statusesRaw.map((s) => String(s || '').trim()).filter(Boolean))].slice(0, 40)
    : [];
  if (!statuses.length) {
    const err = new Error('Select at least one member status.');
    err.status = 400;
    throw err;
  }

  const { data: existing } = await sb
    .from('settings_app_config')
    .select('*')
    .eq('gym_id', gid)
    .maybeSingle();
  const liveCfg =
    existing?.config_json && typeof existing.config_json === 'object'
      ? { ...existing.config_json }
      : {};
  liveCfg.offerEligibleStatuses = statuses;
  const row = {
    gym_id: gid,
    fine_sms_enabled: existing?.fine_sms_enabled !== false,
    fine_sms_grace_days: Number(existing?.fine_sms_grace_days || 0),
    fine_sms_immediate_roles_json: existing?.fine_sms_immediate_roles_json || [],
    finance_use_estimated_expense: existing?.finance_use_estimated_expense !== false,
    config_json: liveCfg,
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from('settings_app_config').upsert(row, { onConflict: 'gym_id' });
  if (error) throw error;
  return { eligibleStatuses: statuses };
}

function shopBranchFilterIds(auth) {
  if (authIsMasterOwner(auth)) {
    const active = String(auth?.activeBranchId || auth?.gymCodeId || '').trim();
    return active ? [active] : null; // null = all branches for owner without active branch
  }
  const allowed = resolveAllowedBranchIds(auth);
  if (allowed === null) return null;
  const list = Array.isArray(allowed) ? allowed.map((id) => String(id).trim()).filter(Boolean) : [];
  return list;
}

async function signedPhotoForRow(row) {
  try {
    const sb = getSupabase();
    const ready = await memberPhotosStorageReady(sb);
    const path = String(row.photo_path || '').trim();
    if (ready && path) {
      const url = await createMemberPhotoSignedUrl(path);
      if (url) return url;
    }
    return String(row.photo_url || '').trim() || null;
  } catch {
    return String(row.photo_url || '').trim() || null;
  }
}

export async function lookupOfferMember(auth, mobileRaw) {
  const mobile = normalizeMobile(mobileRaw);
  if (mobile.length < 10) {
    const err = new Error('Enter a valid 10-digit mobile number.');
    err.status = 400;
    throw err;
  }

  const sb = getSupabase();
  const gid = gymId();
  const eligible = await loadEligibleStatuses(sb, gid);
  const eligibleLower = new Set(eligible.map((s) => s.toLowerCase()));

  let q = sb
    .from(T.members)
    .select(
      'member_code, full_name, mobile, status, assigned_gym_code_id, deleted_at, photo_path, photo_url, photo_version',
    )
    .eq('gym_id', gid)
    .is('deleted_at', null)
    .or(`mobile.eq.${mobile},mobile.eq.91${mobile},mobile.ilike.%${mobile}`)
    .limit(25);

  const { data, error } = await q;
  if (error) throw error;

  const matches = (data || []).filter((row) => {
    const rowMobile = normalizeMobile(row.mobile);
    if (rowMobile !== mobile && !rowMobile.endsWith(mobile) && !mobile.endsWith(rowMobile)) {
      return false;
    }
    const st = String(row.status || '').trim();
    return eligibleLower.has(st.toLowerCase());
  });

  const branchIds = shopBranchFilterIds(auth);
  const scoped = !branchIds
    ? matches
    : matches.filter((row) => {
        const b = String(row.assigned_gym_code_id || '').trim();
        if (!b) return true; // legacy untagged
        return branchIds.includes(b);
      });

  if (!scoped.length) {
    return {
      found: false,
      message: 'No Action Plus member found for this mobile with an eligible status for this shop.',
    };
  }

  const row = scoped[0];
  const photoUrl = await signedPhotoForRow(row);
  return {
    found: true,
    member: {
      memberCode: String(row.member_code || ''),
      fullName: String(row.full_name || ''),
      mobile: String(row.mobile || ''),
      status: String(row.status || ''),
      gymCodeId: row.assigned_gym_code_id ? String(row.assigned_gym_code_id) : null,
      photoUrl,
      label: 'Action Plus Gym Member',
    },
  };
}

function rowToRedemption(row) {
  return {
    id: String(row.id || ''),
    shopStaffLoginId: String(row.shop_staff_login_id || ''),
    shopStaffName: String(row.shop_staff_name || ''),
    memberCode: String(row.member_code || ''),
    memberName: String(row.member_name || ''),
    memberMobile: String(row.member_mobile || ''),
    memberStatus: String(row.member_status || ''),
    offerPercent: Number(row.offer_percent),
    totalCostInr: Number(row.total_cost_inr),
    customerPayInr: Number(row.customer_pay_inr),
    gymCodeId: row.assigned_gym_code_id ? String(row.assigned_gym_code_id) : null,
    createdAt: row.created_at || null,
  };
}

export async function listRecentRedemptions(auth, limit = 10) {
  const sb = getSupabase();
  const gid = gymId();
  const take = Math.min(Math.max(Number(limit) || 10, 1), 10);
  const login = String(auth?.userId || auth?.id || '').trim();

  let q = sb
    .from('offer_redemptions')
    .select('*')
    .eq('gym_id', gid)
    .order('created_at', { ascending: false })
    .limit(take);

  if (!authIsMasterOwner(auth)) {
    q = q.eq('shop_staff_login_id', login);
  }

  const { data, error } = await q;
  if (error) {
    const msg = String(error.message || '');
    if (/relation|does not exist|schema cache/i.test(msg)) {
      const err = new Error(
        'Offers table missing. Run backend/migrations/supabase_offers.sql',
      );
      err.status = 503;
      throw err;
    }
    throw error;
  }
  return (data || []).map(rowToRedemption);
}

export async function saveOfferRedemption(auth, payload) {
  const lookup = await lookupOfferMember(auth, payload?.mobile || payload?.memberMobile);
  if (!lookup.found || !lookup.member) {
    const err = new Error(lookup.message || 'Member not eligible for offer.');
    err.status = 404;
    throw err;
  }

  const offerPercent = Number(payload?.offerPercent);
  const totalCost = Number(payload?.totalCostInr ?? payload?.totalCost);
  const customerPay = computeCustomerPay(totalCost, offerPercent);
  const member = lookup.member;

  const sb = getSupabase();
  const gid = gymId();
  const insertRow = {
    gym_id: gid,
    shop_staff_login_id: String(auth?.userId || auth?.id || 'shop').trim().slice(0, 120),
    shop_staff_name: String(auth?.name || auth?.userId || 'Shop').trim().slice(0, 120),
    member_code: member.memberCode,
    member_name: member.fullName,
    member_mobile: member.mobile,
    member_status: member.status,
    offer_percent: offerPercent,
    total_cost_inr: roundMoney(totalCost),
    customer_pay_inr: customerPay,
    assigned_gym_code_id: member.gymCodeId,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from('offer_redemptions')
    .insert(insertRow)
    .select('*')
    .maybeSingle();
  if (error) throw error;

  const recent = await listRecentRedemptions(auth, 10);
  return { redemption: rowToRedemption(data), recent, member };
}
