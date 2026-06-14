import { isValidCustomTemplateCode } from './customTemplateCodes.js';

export const CUSTOM_TEMPLATE_TYPES = [
  { value: 'promotional', label: 'Promotional' },
  { value: 'informational', label: 'Informational' },
  { value: 'retention', label: 'Retention' },
  { value: 'custom', label: 'Custom' },
];

const TONE_BY_TYPE = {
  promotional: 'bg-violet-50 border-violet-200',
  informational: 'bg-sky-50 border-sky-200',
  retention: 'bg-teal-50 border-teal-200',
  custom: 'bg-indigo-50 border-indigo-200',
};

/** Slug for branch_custom_templates.template_code from a display name. */
export function slugFromTemplateName(name) {
  let base = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  if (!base) return '';
  if (!/^[a-z]/.test(base)) base = `t_${base}`;
  return base.slice(0, 64);
}

export function customTemplateCardTone(templateType) {
  const key = String(templateType || 'promotional').trim().toLowerCase();
  return TONE_BY_TYPE[key] || TONE_BY_TYPE.custom;
}

export function customTemplateTypeLabel(templateType) {
  const hit = CUSTOM_TEMPLATE_TYPES.find((t) => t.value === String(templateType || '').trim().toLowerCase());
  return hit?.label || 'Custom';
}

export function validateCustomTemplateDraft({ templateName, templateCode, messageBody }) {
  const name = String(templateName || '').trim();
  if (!name) return 'Template name is required.';
  if (name.length > 80) return 'Template name must be 80 characters or fewer.';
  const code = String(templateCode || '').trim() || slugFromTemplateName(name);
  if (!code) return 'Could not derive a template code from the name.';
  if (!isValidCustomTemplateCode(code)) {
    return 'Template code is invalid or reserved. Use letters, numbers, and underscores only.';
  }
  const body = String(messageBody == null ? '' : messageBody);
  if (!body.trim()) return 'Message body is required.';
  if (body.length > 8000) return 'Message body must be 8000 characters or fewer.';
  return '';
}

export function friendlyCustomTemplateApiError(err) {
  const raw = String(err?.message || err?.error || err || '').trim();
  const map = {
    'template-name-required': 'Template name is required.',
    'message-body-required': 'Message body is required.',
    'invalid-template-type': 'Choose a valid template type.',
    'invalid-gym-code-id': 'Select a gym branch before saving.',
    'template-code-exists': 'A template with this code already exists. Try a different name.',
    'reserved-template-code': 'That template code is reserved for system templates.',
    'invalid-template-code': 'Template code is invalid. Use lowercase letters, numbers, and underscores.',
    'custom-templates-feature-disabled': 'Enable Custom WhatsApp Templates in Settings first.',
    'custom-template-not-found': 'Template not found for this branch.',
    'no-updatable-fields': 'Nothing to save — change the name, type, or message first.',
  };
  for (const [code, msg] of Object.entries(map)) {
    if (raw.includes(code)) return msg;
  }
  return raw ? `Save failed: ${raw}` : 'Save failed.';
}
