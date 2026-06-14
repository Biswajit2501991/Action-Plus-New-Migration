import { T } from '../db/tables.js';
import { getSupabase, gymId } from '../db/supabase/client.js';
import {
  assertWhatsappTemplateWriteAllowed,
  resolveEffectiveTemplateBranchId,
  staffMayWriteWhatsappTemplates,
} from './branchWhatsappTemplates.js';

const CUSTOM_TEMPLATE_CODE_RE = /^[a-z][a-z0-9_]{0,63}$/;
const RESERVED_SYSTEM_TEMPLATE_CODES = new Set([
  'reminder',
  'monthreminder',
  'success',
  'fine',
  'deactivate',
  'hold',
  'welcome',
]);
const TEMPLATE_TYPES = new Set(['promotional', 'informational', 'retention', 'custom']);
const CHANNELS = new Set(['whatsapp', 'sms', 'email', 'push']);
const STATUSES = new Set(['active', 'draft', 'archived']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export { resolveEffectiveTemplateBranchId, assertWhatsappTemplateWriteAllowed, staffMayWriteWhatsappTemplates };

function assertBranchUuid(id) {
  const safe = String(id || '').trim();
  if (!UUID_RE.test(safe)) {
    const err = new Error('invalid-gym-code-id');
    err.status = 400;
    throw err;
  }
  return safe;
}

export function assertValidCustomTemplateId(id) {
  const safe = String(id || '').trim();
  if (!UUID_RE.test(safe)) {
    throw Object.assign(new Error('invalid-template-id'), { status: 400 });
  }
  return safe;
}

export function assertValidCustomTemplateCode(code) {
  const safe = String(code || '').trim();
  if (!CUSTOM_TEMPLATE_CODE_RE.test(safe)) {
    throw Object.assign(new Error('invalid-template-code'), { status: 400 });
  }
  if (RESERVED_SYSTEM_TEMPLATE_CODES.has(safe.toLowerCase())) {
    throw Object.assign(new Error('reserved-template-code'), { status: 400 });
  }
  return safe;
}

function normalizeTemplateName(name) {
  const safe = String(name || '').trim();
  if (!safe) {
    throw Object.assign(new Error('template-name-required'), { status: 400 });
  }
  if (safe.length > 80) {
    throw Object.assign(new Error('template-name-too-long'), { status: 413 });
  }
  return safe;
}

function normalizeMessageBody(body) {
  const safe = String(body == null ? '' : body);
  if (!safe.trim()) {
    throw Object.assign(new Error('message-body-required'), { status: 400 });
  }
  if (safe.length > 8000) {
    throw Object.assign(new Error('message-body-too-long'), { status: 413 });
  }
  return safe;
}

function normalizeTemplateType(type) {
  const safe = String(type || 'promotional').trim().toLowerCase();
  if (!TEMPLATE_TYPES.has(safe)) {
    throw Object.assign(new Error('invalid-template-type'), { status: 400 });
  }
  return safe;
}

function normalizeChannel(channel) {
  const safe = String(channel || 'whatsapp').trim().toLowerCase();
  if (!CHANNELS.has(safe)) {
    throw Object.assign(new Error('invalid-channel'), { status: 400 });
  }
  return safe;
}

function normalizeStatus(status) {
  const safe = String(status || 'active').trim().toLowerCase();
  if (!STATUSES.has(safe)) {
    throw Object.assign(new Error('invalid-status'), { status: 400 });
  }
  return safe;
}

/** @param {Record<string, unknown>} row */
export function customTemplateRowToApp(row) {
  if (!row) return null;
  return {
    id: String(row.id || ''),
    gymCodeId: String(row.gym_code_id || ''),
    templateCode: String(row.template_code || ''),
    templateName: String(row.template_name || ''),
    templateType: String(row.template_type || 'promotional'),
    messageBody: String(row.message_body || ''),
    channel: String(row.channel || 'whatsapp'),
    isActive: row.is_active !== false,
    status: String(row.status || 'active'),
    createdBy: row.created_by == null ? null : String(row.created_by),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    sortOrder: Number(row.sort_order || 0),
  };
}

export async function readCustomTemplatesFeatureEnabled() {
  const sb = getSupabase();
  const gid = gymId();
  const { data, error } = await sb
    .from(T.settings_app_config)
    .select('config_json')
    .eq('gym_id', gid)
    .maybeSingle();
  if (error) throw error;
  const cfg = data?.config_json && typeof data.config_json === 'object' ? data.config_json : {};
  return cfg.customTemplatesEnabled === true;
}

export function assertCustomTemplatesFeatureEnabled(enabled) {
  if (enabled === true) return;
  const err = new Error('custom-templates-feature-disabled');
  err.status = 403;
  throw err;
}

/** @returns {Promise<{ gymCodeId: string, featureEnabled: boolean, templates: object[] }>} */
export async function listBranchCustomTemplates(gymCodeId, options = {}) {
  const includeArchived = options.includeArchived === true;
  const sb = getSupabase();
  const gid = gymId();
  const branchId = assertBranchUuid(String(gymCodeId || '').trim());
  const featureEnabled = await readCustomTemplatesFeatureEnabled();

  let query = sb
    .from(T.branch_custom_templates)
    .select('*')
    .eq('gym_id', gid)
    .eq('gym_code_id', branchId)
    .order('sort_order', { ascending: true })
    .order('template_name', { ascending: true });

  if (!includeArchived) {
    query = query.eq('is_active', true).neq('status', 'archived');
  }

  const { data, error } = await query;
  if (error) throw error;

  const templates = (data || []).map(customTemplateRowToApp).filter(Boolean);
  if (!featureEnabled) {
    return { gymCodeId: branchId, featureEnabled: false, templates: [] };
  }
  return { gymCodeId: branchId, featureEnabled: true, templates };
}

async function nextSortOrder(sb, gid, branchId) {
  const { data, error } = await sb
    .from(T.branch_custom_templates)
    .select('sort_order')
    .eq('gym_id', gid)
    .eq('gym_code_id', branchId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Number(data?.sort_order || 0) + 1;
}

/** @returns {Promise<object>} */
export async function createBranchCustomTemplate(gymCodeId, payload, meta = {}) {
  assertCustomTemplatesFeatureEnabled(await readCustomTemplatesFeatureEnabled());

  const sb = getSupabase();
  const gid = gymId();
  const branchId = assertBranchUuid(String(gymCodeId || '').trim());
  const templateCode = assertValidCustomTemplateCode(payload?.templateCode);
  const templateName = normalizeTemplateName(payload?.templateName);
  const messageBody = normalizeMessageBody(payload?.messageBody);
  const templateType = normalizeTemplateType(payload?.templateType);
  const channel = normalizeChannel(payload?.channel);
  const nowIso = new Date().toISOString();
  const sortOrder = Number.isFinite(Number(payload?.sortOrder))
    ? Math.max(0, Math.floor(Number(payload.sortOrder)))
    : await nextSortOrder(sb, gid, branchId);

  const { data, error } = await sb
    .from(T.branch_custom_templates)
    .insert({
      gym_id: gid,
      gym_code_id: branchId,
      template_code: templateCode,
      template_name: templateName,
      template_type: templateType,
      message_body: messageBody,
      channel,
      is_active: true,
      status: 'active',
      created_by: String(meta.createdBy || '').trim() || null,
      created_at: nowIso,
      updated_at: nowIso,
      sort_order: sortOrder,
    })
    .select('*')
    .single();

  if (error) {
    const msg = String(error.message || error);
    if (/duplicate key|unique constraint|23505/i.test(msg)) {
      throw Object.assign(new Error('template-code-exists'), { status: 409 });
    }
    throw error;
  }

  return customTemplateRowToApp(data);
}

async function loadTemplateForBranch(templateId, branchId) {
  const sb = getSupabase();
  const gid = gymId();
  const safeId = assertValidCustomTemplateId(templateId);
  const safeBranch = assertBranchUuid(branchId);
  const { data, error } = await sb
    .from(T.branch_custom_templates)
    .select('*')
    .eq('gym_id', gid)
    .eq('gym_code_id', safeBranch)
    .eq('id', safeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error('custom-template-not-found'), { status: 404 });
  }
  return data;
}

/** @returns {Promise<object>} */
export async function updateBranchCustomTemplate(templateId, gymCodeId, payload) {
  assertCustomTemplatesFeatureEnabled(await readCustomTemplatesFeatureEnabled());

  const branchId = assertBranchUuid(String(gymCodeId || '').trim());
  const existing = await loadTemplateForBranch(templateId, branchId);
  const sb = getSupabase();
  const gid = gymId();
  const safeId = assertValidCustomTemplateId(templateId);
  const patch = { updated_at: new Date().toISOString() };

  if (payload?.templateName != null) {
    patch.template_name = normalizeTemplateName(payload.templateName);
  }
  if (payload?.messageBody != null) {
    patch.message_body = normalizeMessageBody(payload.messageBody);
  }
  if (payload?.templateType != null) {
    patch.template_type = normalizeTemplateType(payload.templateType);
  }
  if (payload?.channel != null) {
    patch.channel = normalizeChannel(payload.channel);
  }
  if (payload?.status != null) {
    patch.status = normalizeStatus(payload.status);
  }
  if (payload?.isActive != null) {
    patch.is_active = Boolean(payload.isActive);
  }
  if (payload?.sortOrder != null) {
    const n = Number(payload.sortOrder);
    if (!Number.isFinite(n) || n < 0) {
      throw Object.assign(new Error('invalid-sort-order'), { status: 400 });
    }
    patch.sort_order = Math.floor(n);
  }

  if (Object.keys(patch).length === 1) {
    throw Object.assign(new Error('no-updatable-fields'), { status: 400 });
  }

  const { data, error } = await sb
    .from(T.branch_custom_templates)
    .update(patch)
    .eq('gym_id', gid)
    .eq('gym_code_id', branchId)
    .eq('id', safeId)
    .select('*')
    .single();
  if (error) throw error;

  return {
    template: customTemplateRowToApp(data),
    before: customTemplateRowToApp(existing),
  };
}

/** Soft archive — hides template from active UI; history preserved. */
export async function archiveBranchCustomTemplate(templateId, gymCodeId) {
  assertCustomTemplatesFeatureEnabled(await readCustomTemplatesFeatureEnabled());

  const branchId = assertBranchUuid(String(gymCodeId || '').trim());
  const existing = await loadTemplateForBranch(templateId, branchId);
  const sb = getSupabase();
  const gid = gymId();
  const safeId = assertValidCustomTemplateId(templateId);
  const nowIso = new Date().toISOString();

  const { data, error } = await sb
    .from(T.branch_custom_templates)
    .update({
      is_active: false,
      status: 'archived',
      updated_at: nowIso,
    })
    .eq('gym_id', gid)
    .eq('gym_code_id', branchId)
    .eq('id', safeId)
    .select('*')
    .single();
  if (error) throw error;

  return {
    template: customTemplateRowToApp(data),
    before: customTemplateRowToApp(existing),
  };
}

/** Hard delete — master owner only (enforced at API). History rows are not removed. */
export async function deleteBranchCustomTemplate(templateId, gymCodeId) {
  assertCustomTemplatesFeatureEnabled(await readCustomTemplatesFeatureEnabled());

  const branchId = assertBranchUuid(String(gymCodeId || '').trim());
  const existing = await loadTemplateForBranch(templateId, branchId);
  const sb = getSupabase();
  const gid = gymId();
  const safeId = assertValidCustomTemplateId(templateId);

  const { error, count } = await sb
    .from(T.branch_custom_templates)
    .delete({ count: 'exact' })
    .eq('gym_id', gid)
    .eq('gym_code_id', branchId)
    .eq('id', safeId);
  if (error) throw error;
  if (!count) {
    throw Object.assign(new Error('custom-template-not-found'), { status: 404 });
  }

  const before = customTemplateRowToApp(existing);
  return {
    deletedId: safeId,
    templateCode: before?.templateCode || '',
    gymCodeId: branchId,
    before,
  };
}
