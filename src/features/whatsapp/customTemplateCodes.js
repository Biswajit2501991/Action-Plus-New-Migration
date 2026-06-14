import { WHATSAPP_TEMPLATE_KEYS } from './templateKeys.js';

/** Lowercase slugs blocked on branch_custom_templates.template_code (mirrors DB constraint). */
export const RESERVED_SYSTEM_TEMPLATE_CODES = WHATSAPP_TEMPLATE_KEYS.map((k) => String(k).toLowerCase());

const CUSTOM_TEMPLATE_CODE_RE = /^[a-z][a-z0-9_]{0,63}$/;

export function isValidCustomTemplateCode(code) {
  const safe = String(code || '').trim();
  if (!CUSTOM_TEMPLATE_CODE_RE.test(safe)) return false;
  return !RESERVED_SYSTEM_TEMPLATE_CODES.includes(safe.toLowerCase());
}

/** Namespace used in member_message_history.template_key for custom sends. */
export function customTemplateHistoryKey(templateCode) {
  const safe = String(templateCode || '').trim();
  return safe ? `custom:${safe}` : '';
}

export function isCustomTemplateHistoryKey(templateKey) {
  return String(templateKey || '').startsWith('custom:');
}

export function parseCustomTemplateHistoryKey(templateKey) {
  const raw = String(templateKey || '').trim();
  if (!raw.startsWith('custom:')) return null;
  const code = raw.slice('custom:'.length).trim();
  return code || null;
}
