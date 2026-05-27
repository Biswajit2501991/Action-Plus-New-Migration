import { authIsOwner } from '../auth/branchFilter.js';
import { T } from '../db/tables.js';
import { getSupabase, gymId } from '../db/supabase/client.js';
import { resolveGymCodeId } from './gymCodesService.js';

const TEMPLATE_KEY_RE = /^[a-z][a-zA-Z0-9_-]{0,63}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertBranchUuid(id) {
  const safe = String(id || '').trim();
  if (!UUID_RE.test(safe)) {
    const err = new Error('invalid-gym-code-id');
    err.status = 400;
    throw err;
  }
  return safe;
}

export function normalizeTemplateKey(key) {
  return String(key || '').trim();
}

export function assertValidTemplateKey(key) {
  const safe = normalizeTemplateKey(key);
  if (!TEMPLATE_KEY_RE.test(safe)) {
    throw Object.assign(new Error('invalid-template-key'), { status: 400 });
  }
  return safe;
}

/** @returns {Promise<string|null>} */
export async function resolveHqGymCodeId() {
  const sb = getSupabase();
  const gid = gymId();
  const { data, error } = await sb
    .from(T.gym_codes)
    .select('id')
    .eq('gym_id', gid)
    .eq('code', 'HQ')
    .maybeSingle();
  if (error) throw error;
  if (data?.id) return String(data.id);
  const { data: first, error: e2 } = await sb
    .from(T.gym_codes)
    .select('id')
    .eq('gym_id', gid)
    .order('code', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (e2) throw e2;
  return first?.id ? String(first.id) : null;
}

/**
 * Effective branch for template API access.
 * - Owner: query/body gymCodeId (required for GET/PATCH).
 * - Staff: always auth.gymCodeId (ignores client param).
 */
/** @returns {Promise<string>} canonical gym_codes.id UUID */
async function resolveTemplateBranchUuid(codeOrId) {
  const raw = String(codeOrId || '').trim();
  if (!raw) {
    const err = new Error('gym-code-id-required');
    err.status = 400;
    throw err;
  }
  const id = await resolveGymCodeId(raw);
  if (!id) {
    const err = new Error('gym-code-not-found');
    err.status = 404;
    throw err;
  }
  return assertBranchUuid(String(id));
}

export async function resolveEffectiveTemplateBranchId(auth, requestedGymCodeId) {
  if (authIsOwner(auth)) {
    const raw = String(requestedGymCodeId || '').trim();
    if (!raw) {
      const hq = await resolveHqGymCodeId();
      if (!hq) {
        const err = new Error('gym-code-id-required');
        err.status = 400;
        throw err;
      }
      return hq;
    }
    return resolveTemplateBranchUuid(raw);
  }
  const staffBranch = String(auth?.gymCodeId || '').trim();
  if (!staffBranch) {
    const err = new Error('branch-scope-missing');
    err.status = 403;
    throw err;
  }
  return resolveTemplateBranchUuid(staffBranch);
}

/** @param {import('../auth/accessControl.js').NormalizedAccess | { __owner?: boolean }} access */
export function staffMayWriteWhatsappTemplates(access) {
  if (!access) return false;
  if (access.__owner) return true;
  return access.whatsapp?.viewTemplates !== false;
}

/**
 * @param {import('../auth/accessControl.js').NormalizedAccess | { __owner?: boolean }} access
 */
export function assertWhatsappTemplateWriteAllowed(auth, access) {
  if (authIsOwner(auth)) return;
  if (!staffMayWriteWhatsappTemplates(access)) {
    const err = new Error('whatsapp-template-write-forbidden');
    err.status = 403;
    throw err;
  }
}

/** @returns {Promise<{ gymCodeId: string, templates: Record<string, string>, updatedAt: string|null }>} */
export async function getBranchWhatsappTemplates(gymCodeId) {
  const sb = getSupabase();
  const gid = gymId();
  const branchId = await resolveTemplateBranchUuid(gymCodeId);
  const { data, error } = await sb
    .from(T.settings_templates)
    .select('template_key, body, updated_at')
    .eq('gym_id', gid)
    .eq('gym_code_id', branchId)
    .eq('channel', 'whatsapp');
  if (error) throw error;
  const templates = {};
  let latestUpdated = null;
  for (const row of data || []) {
    const key = normalizeTemplateKey(row.template_key);
    if (!key) continue;
    templates[key] = String(row.body || '');
    if (!latestUpdated || (row.updated_at && row.updated_at > latestUpdated)) {
      latestUpdated = row.updated_at;
    }
  }
  return { gymCodeId: branchId, templates, updatedAt: latestUpdated };
}

/** @returns {Promise<{ key: string, body: string, updatedAt: string, gymCodeId: string }>} */
export async function upsertBranchWhatsappTemplate(gymCodeId, { key, body }) {
  const safeKey = assertValidTemplateKey(key);
  const safeBody = String(body == null ? '' : body);
  if (safeBody.length > 8000) {
    const err = new Error('template body exceeds 8000 chars');
    err.status = 413;
    throw err;
  }
  const sb = getSupabase();
  const gid = gymId();
  const branchId = await resolveTemplateBranchUuid(gymCodeId);
  const nowIso = new Date().toISOString();

  const { data: existing, error: findErr } = await sb
    .from(T.settings_templates)
    .select('id, gym_code_id')
    .eq('gym_id', gid)
    .eq('template_key', safeKey)
    .eq('channel', 'whatsapp');
  if (findErr) throw new Error(`settings_templates lookup failed: ${findErr.message}`);

  const rows = existing || [];
  const forBranch = rows.find((r) => String(r.gym_code_id || '') === branchId);
  if (forBranch?.id) {
    const { error: updErr } = await sb
      .from(T.settings_templates)
      .update({ body: safeBody, updated_at: nowIso })
      .eq('id', forBranch.id);
    if (updErr) throw new Error(`settings_templates update failed: ${updErr.message}`);
    return { key: safeKey, body: safeBody, updatedAt: nowIso, gymCodeId: branchId };
  }

  // Pre-branch migration: one global row per template — stamp gym_code_id on it.
  if (rows.length === 1) {
    const { error: legacyUpdErr } = await sb
      .from(T.settings_templates)
      .update({ body: safeBody, gym_code_id: branchId, updated_at: nowIso })
      .eq('id', rows[0].id);
    if (legacyUpdErr) throw new Error(`settings_templates update failed: ${legacyUpdErr.message}`);
    return { key: safeKey, body: safeBody, updatedAt: nowIso, gymCodeId: branchId };
  }

  const { error: insErr } = await sb.from(T.settings_templates).insert({
    gym_id: gid,
    gym_code_id: branchId,
    template_key: safeKey,
    channel: 'whatsapp',
    body: safeBody,
    updated_at: nowIso,
  });
  if (!insErr) {
    return { key: safeKey, body: safeBody, updatedAt: nowIso, gymCodeId: branchId };
  }

  const msg = String(insErr.message || insErr);
  if (/duplicate key|unique constraint|23505/i.test(msg) && rows[0]?.id) {
    const { error: dupUpdErr } = await sb
      .from(T.settings_templates)
      .update({ body: safeBody, gym_code_id: branchId, updated_at: nowIso })
      .eq('id', rows[0].id);
    if (!dupUpdErr) {
      return { key: safeKey, body: safeBody, updatedAt: nowIso, gymCodeId: branchId };
    }
  }
  if (/null value.*gym_code_id/i.test(msg) && rows[0]?.id) {
    const { error: nullUpdErr } = await sb
      .from(T.settings_templates)
      .update({ body: safeBody, gym_code_id: branchId, updated_at: nowIso })
      .eq('id', rows[0].id);
    if (!nullUpdErr) {
      return { key: safeKey, body: safeBody, updatedAt: nowIso, gymCodeId: branchId };
    }
  }

  throw new Error(`settings_templates save failed: ${msg}`);
}

/**
 * Resolve template body for a member: member branch → HQ fallback.
 * @returns {Promise<{ body: string, templateKey: string, gymCodeId: string, usedHqFallback: boolean }|null>}
 */
/** Copy HQ WhatsApp templates into a newly created branch. */
export async function seedBranchWhatsappTemplatesFromHq(targetGymCodeId) {
  const targetId = String(targetGymCodeId || '').trim();
  if (!targetId) return;
  const hqId = await resolveHqGymCodeId();
  if (!hqId) return;
  const { templates } = await getBranchWhatsappTemplates(hqId);
  for (const [key, body] of Object.entries(templates)) {
    await upsertBranchWhatsappTemplate(targetId, { key, body });
  }
}

export async function resolveMemberWhatsappTemplateBody(templateKey, memberAssignedGymCodeId) {
  const key = normalizeTemplateKey(templateKey);
  if (!key) return null;
  let branchId = String(memberAssignedGymCodeId || '').trim();
  let usedHqFallback = false;
  if (!branchId) {
    branchId = await resolveHqGymCodeId();
    usedHqFallback = Boolean(branchId);
    if (!branchId) return null;
  }
  const { templates } = await getBranchWhatsappTemplates(branchId);
  const body = templates[key];
  if (body == null || body === '') {
    if (usedHqFallback) return null;
    const hqId = await resolveHqGymCodeId();
    if (hqId && hqId !== branchId) {
      const hq = await getBranchWhatsappTemplates(hqId);
      const hqBody = hq.templates[key];
      if (hqBody != null && hqBody !== '') {
        return { body: hqBody, templateKey: key, gymCodeId: hqId, usedHqFallback: true };
      }
    }
    return null;
  }
  return { body, templateKey: key, gymCodeId: branchId, usedHqFallback };
}
