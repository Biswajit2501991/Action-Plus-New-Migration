/**
 * Append-only staff comments on visitors.
 * Does not rewrite visitors.notes, convert flow, members, or payments.
 */

import { T } from '../db/tables.js';
import { getSupabase, gymId } from '../db/supabase/client.js';
import { resolveReadBranchScope } from '../auth/branchScope.js';
import { authIsMasterOwner } from '../auth/tenant/scopedAuth.js';

const BODY_MAX = 2000;

function rowToComment(row) {
  return {
    id: String(row.id || ''),
    visitorId: String(row.external_visitor_id || ''),
    gymCodeId: row.assigned_gym_code_id ? String(row.assigned_gym_code_id) : null,
    body: String(row.body || ''),
    createdBy: String(row.created_by || ''),
    createdByName: String(row.created_by_name || row.created_by || ''),
    createdAt: row.created_at || null,
  };
}

function normalizeVisitorId(raw) {
  return String(raw || '').trim().slice(0, 120);
}

function normalizeBody(raw) {
  return String(raw || '').trim().slice(0, BODY_MAX);
}

async function loadVisitorRow(sb, gid, visitorId) {
  const id = normalizeVisitorId(visitorId);
  if (!id) return null;

  let q = sb
    .from(T.visitors)
    .select('external_visitor_id, status, assigned_gym_code_id')
    .eq('gym_id', gid)
    .eq('external_visitor_id', id)
    .maybeSingle();
  let { data, error } = await q;
  if (error) throw error;
  if (data) return data;

  // Website leads sometimes use W-<bigint> client ids before external id backfill.
  if (/^W-\d+$/i.test(id)) {
    const internalId = Number(id.slice(2));
    if (Number.isFinite(internalId)) {
      const retry = await sb
        .from(T.visitors)
        .select('external_visitor_id, status, assigned_gym_code_id, id')
        .eq('gym_id', gid)
        .eq('id', internalId)
        .maybeSingle();
      if (retry.error) throw retry.error;
      if (retry.data) {
        return {
          ...retry.data,
          external_visitor_id:
            retry.data.external_visitor_id || `W-${retry.data.id}`,
        };
      }
    }
  }
  return null;
}

function assertVisitorReadable(visitor, branchScope) {
  if (!visitor) {
    const err = new Error('Visitor not found.');
    err.status = 404;
    throw err;
  }
  if (!branchScope || branchScope.isOwner) return;
  if (branchScope.staffNoBranch) {
    const err = new Error('Your profile has no gym branch assigned.');
    err.status = 403;
    throw err;
  }
  const rowBranch = String(visitor.assigned_gym_code_id || '').trim();
  const active = String(branchScope.gymCodeId || '').trim();
  // Website leads may have null branch — staff in a branch may still see them (same as visitors list).
  if (rowBranch && active && rowBranch !== active) {
    const err = new Error('This visitor belongs to another branch.');
    err.status = 403;
    throw err;
  }
}

function canAppendComment({ auth, visitor }) {
  const converted = String(visitor?.status || '') === 'Converted';
  if (!converted) return true;
  return authIsMasterOwner(auth);
}

export async function listVisitorStaffCommentsForScope(auth) {
  const sb = getSupabase();
  const gid = gymId();
  const branchScope = resolveReadBranchScope(auth);
  if (branchScope?.staffNoBranch) return [];

  let q = sb
    .from('visitor_staff_comments')
    .select('*')
    .eq('gym_id', gid)
    .order('created_at', { ascending: false })
    .limit(2000);

  if (branchScope?.gymCodeId && !branchScope.isOwner) {
    q = q.or(
      `assigned_gym_code_id.eq.${branchScope.gymCodeId},assigned_gym_code_id.is.null`,
    );
  } else if (branchScope?.gymCodeId && branchScope.isOwner) {
    q = q.or(
      `assigned_gym_code_id.eq.${branchScope.gymCodeId},assigned_gym_code_id.is.null`,
    );
  }

  const { data, error } = await q;
  if (error) {
    const msg = String(error.message || '');
    if (/relation|does not exist|schema cache/i.test(msg)) {
      const err = new Error(
        'Staff comments table is missing. Run backend/migrations/supabase_visitor_staff_comments.sql',
      );
      err.status = 503;
      throw err;
    }
    throw error;
  }
  return (data || []).map(rowToComment);
}

export async function listCommentsForVisitor(auth, visitorId) {
  const sb = getSupabase();
  const gid = gymId();
  const branchScope = resolveReadBranchScope(auth);
  const visitor = await loadVisitorRow(sb, gid, visitorId);
  assertVisitorReadable(visitor, branchScope);

  const externalId = normalizeVisitorId(visitor.external_visitor_id || visitorId);
  const { data, error } = await sb
    .from('visitor_staff_comments')
    .select('*')
    .eq('gym_id', gid)
    .eq('external_visitor_id', externalId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return {
    visitorId: externalId,
    converted: String(visitor.status || '') === 'Converted',
    canAdd: canAppendComment({ auth, visitor }),
    comments: (data || []).map(rowToComment),
  };
}

export async function addVisitorStaffComment(auth, visitorId, bodyRaw) {
  const sb = getSupabase();
  const gid = gymId();
  const branchScope = resolveReadBranchScope(auth);
  const visitor = await loadVisitorRow(sb, gid, visitorId);
  assertVisitorReadable(visitor, branchScope);

  if (!canAppendComment({ auth, visitor })) {
    const err = new Error(
      'This visitor is converted. Only the owner can add another staff comment.',
    );
    err.status = 403;
    throw err;
  }

  const body = normalizeBody(bodyRaw);
  if (!body) {
    const err = new Error('Comment text is required.');
    err.status = 400;
    throw err;
  }

  const externalId = normalizeVisitorId(visitor.external_visitor_id || visitorId);
  const actorId = String(auth?.userId || auth?.id || 'staff').trim().slice(0, 120);
  const actorName = String(auth?.name || auth?.userId || 'Staff').trim().slice(0, 120);
  const branchId =
    String(visitor.assigned_gym_code_id || branchScope?.gymCodeId || '').trim() || null;

  const insertRow = {
    gym_id: gid,
    external_visitor_id: externalId,
    assigned_gym_code_id: branchId,
    body,
    created_by: actorId || 'staff',
    created_by_name: actorName || actorId || 'Staff',
    created_at: new Date().toISOString(),
  };

  const { data, error } = await sb
    .from('visitor_staff_comments')
    .insert(insertRow)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return rowToComment(data);
}
