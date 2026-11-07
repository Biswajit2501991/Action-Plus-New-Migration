/**
 * Staff phone alerts after a saved visitor or a saved member chat message.
 * Does not change the visitor row, the chat row, payments, or WhatsApp.
 */

import { getSupabase, gymId } from '../../db/supabase/client.js';
import { T } from '../../db/tables.js';
import { getStaffAppUser } from '../../auth/staffAuth.js';
import {
  STAFF_CHAT_TITLE,
  STAFF_VISITOR_BODY,
  STAFF_VISITOR_TITLE,
  staffChatBody,
  staffShouldGetChatAlert,
  staffShouldGetVisitorAlert,
} from './staffDeskPushRules.js';

const PORTAL_SITE_DEFAULT = 'https://www.actionplusgym.com';
let staffCache = { at: 0, users: [] };

function portalSiteBase() {
  return String(
    process.env.MEMBER_PORTAL_SITE_URL
      || process.env.GYM_WEBSITE_URL
      || process.env.NEXT_PUBLIC_MEMBER_PORTAL_URL
      || PORTAL_SITE_DEFAULT,
  ).trim().replace(/\/+$/, '');
}

function cronSecret() {
  const secret = String(process.env.MEMBER_PORTAL_CRON_SECRET || '').trim();
  if ((process.env.NODE_ENV || 'development') === 'production' && secret.length < 16) return '';
  return secret;
}

async function listStaffUsers() {
  if (Date.now() - staffCache.at < 20_000 && staffCache.users.length) return staffCache.users;
  const sb = getSupabase();
  const gid = gymId();
  const { data, error } = await sb
    .from(T.staff_users)
    .select('staff_login_id, is_blocked')
    .eq('gym_id', gid);
  if (error) throw new Error(error.message);
  const users = [];
  for (const row of data || []) {
    if (row.is_blocked) continue;
    const login = String(row.staff_login_id || '').trim();
    if (!login) continue;
    const user = await getStaffAppUser(login);
    if (user && !user.blocked) users.push(user);
  }
  staffCache = { at: Date.now(), users };
  return users;
}

async function subscriptionsFor(logins) {
  const wanted = new Set(logins.map((id) => String(id || '').trim().toLowerCase()).filter(Boolean));
  if (!wanted.size) return [];
  const sb = getSupabase();
  const gid = gymId();
  const { data, error } = await sb
    .from('staff_push_subscriptions')
    .select('staff_login_id, endpoint, p256dh, auth')
    .eq('gym_id', gid);
  if (error) throw new Error(error.message);
  return (data || []).filter((row) => wanted.has(String(row.staff_login_id || '').trim().toLowerCase()));
}

async function claimEvent(eventKey) {
  const sb = getSupabase();
  const gid = gymId();
  const { error } = await sb.from('staff_push_send_log').insert({
    gym_id: gid,
    event_key: eventKey,
  });
  if (!error) return true;
  const text = `${error.code || ''} ${error.message || ''}`;
  if (/23505|duplicate/i.test(text)) return false;
  throw new Error(error.message);
}

async function dropEndpoints(endpoints) {
  const gone = [...new Set((endpoints || []).map((e) => String(e || '').trim()).filter(Boolean))];
  if (!gone.length) return;
  const sb = getSupabase();
  const gid = gymId();
  await sb.from('staff_push_subscriptions').delete().eq('gym_id', gid).in('endpoint', gone);
}

async function deliver(subs, { title, body, url, tag }) {
  const secret = cronSecret();
  const base = portalSiteBase();
  if (!secret || !base || !subs.length) return { sent: 0, failed: subs.length, gone: [] };
  const items = subs.map((row) => ({
    endpoint: row.endpoint,
    p256dh: row.p256dh,
    auth: row.auth,
    title,
    body,
    url,
    tag,
  }));
  const res = await fetch(`${base}/api/member/push/staff-deliver`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ items }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || `staff-deliver-failed (${res.status})`);
  }
  if (Array.isArray(data?.gone) && data.gone.length) await dropEndpoints(data.gone);
  return data || { sent: 0, failed: 0, gone: [] };
}

async function notifyStaff(eventKey, predicate, message) {
  const subs = await subscriptionsFor(
    (await listStaffUsers()).filter(predicate).map((user) => user.id),
  );
  if (!subs.length) return { ok: true, skipped: true, reason: 'no-subscriptions' };
  const claimed = await claimEvent(eventKey);
  if (!claimed) return { ok: true, skipped: true, reason: 'already-sent' };
  await deliver(subs, message);
  return { ok: true, skipped: false };
}

export async function notifyNewVisitor(visitor) {
  const id = String(visitor?.id || '').trim();
  if (!id) return { ok: false, error: 'visitor-id-required' };
  const branchId = String(visitor.assignedGymCodeId || visitor.assigned_gym_code_id || '').trim();
  return notifyStaff(
    `visitor:${id}`,
    (user) => staffShouldGetVisitorAlert(user, branchId),
    {
      title: STAFF_VISITOR_TITLE,
      body: STAFF_VISITOR_BODY,
      url: '/members?tab=visitors',
      tag: `staff-visitor:${id}`,
    },
  );
}

export async function notifyPortalChatMessage({ messageId, memberName, branchId }) {
  const id = String(messageId || '').trim();
  if (!id) return { ok: false, error: 'message-id-required' };
  return notifyStaff(
    `chat:${id}`,
    (user) => staffShouldGetChatAlert(user, branchId),
    {
      title: STAFF_CHAT_TITLE,
      body: staffChatBody(memberName),
      url: '/portal-chat',
      tag: `staff-chat:${id}`,
    },
  );
}

export async function existingVisitorIds(ids) {
  const wanted = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const found = new Set();
  if (!wanted.length) return found;
  const sb = getSupabase();
  const gid = gymId();
  for (let i = 0; i < wanted.length; i += 100) {
    const chunk = wanted.slice(i, i + 100);
    const { data, error } = await sb
      .from(T.visitors)
      .select('external_visitor_id')
      .eq('gym_id', gid)
      .in('external_visitor_id', chunk);
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      const id = String(row.external_visitor_id || '').trim();
      if (id) found.add(id);
    }
  }
  return found;
}

export async function publicVapidKey() {
  const fromEnv = String(process.env.WEB_PUSH_VAPID_PUBLIC_KEY || '').trim();
  if (fromEnv) return fromEnv;
  const base = portalSiteBase();
  if (!base) return '';
  const res = await fetch(`${base}/api/member/push/vapid`);
  const data = await res.json().catch(() => null);
  return res.ok ? String(data?.publicKey || '').trim() : '';
}

export async function staffPushEnabled(staffLoginId) {
  const login = String(staffLoginId || '').trim().toLowerCase();
  if (!login) return false;
  const sb = getSupabase();
  const gid = gymId();
  const { data, error } = await sb
    .from('staff_push_subscriptions')
    .select('id')
    .eq('gym_id', gid)
    .eq('staff_login_id', login)
    .limit(1);
  if (error) throw new Error(error.message);
  return Boolean(data && data.length);
}

export async function saveStaffPushSubscription(staffLoginId, subscription) {
  const login = String(staffLoginId || '').trim().toLowerCase();
  const endpoint = String(subscription?.endpoint || '').trim();
  const p256dh = String(subscription?.keys?.p256dh || subscription?.p256dh || '').trim();
  const auth = String(subscription?.keys?.auth || subscription?.auth || '').trim();
  if (!login || !endpoint || !p256dh || !auth) {
    const err = new Error('subscription-required');
    err.status = 400;
    throw err;
  }
  const sb = getSupabase();
  const gid = gymId();
  const { error } = await sb.from('staff_push_subscriptions').upsert({
    gym_id: gid,
    staff_login_id: login,
    endpoint,
    p256dh,
    auth,
  }, { onConflict: 'gym_id,endpoint' });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function removeStaffPushSubscription(staffLoginId, endpoint) {
  const login = String(staffLoginId || '').trim().toLowerCase();
  const target = String(endpoint || '').trim();
  const sb = getSupabase();
  const gid = gymId();
  let q = sb.from('staff_push_subscriptions').delete().eq('gym_id', gid).eq('staff_login_id', login);
  if (target) q = q.eq('endpoint', target);
  const { error } = await q;
  if (error) throw new Error(error.message);
  return { ok: true };
}
