/** Branch custom WhatsApp template helpers (prod parity). */

export const CUSTOM_TEMPLATES_FEATURE_FLAG_KEY = "customTemplatesEnabled";

export const CUSTOM_TEMPLATE_TYPES = [
  { value: "promotional", label: "Promotional" },
  { value: "informational", label: "Informational" },
  { value: "retention", label: "Retention" },
  { value: "custom", label: "Custom" },
] as const;

export type CustomTemplateType = (typeof CUSTOM_TEMPLATE_TYPES)[number]["value"];

export type CustomTemplate = {
  id: string;
  gymCodeId?: string;
  templateCode?: string;
  templateName?: string;
  templateType?: string;
  messageBody?: string;
  channel?: string;
  isActive?: boolean;
  status?: string;
};

const TONE_BY_TYPE: Record<string, string> = {
  promotional:
    "border-violet-200/90 bg-gradient-to-br from-violet-50 to-white text-violet-950 dark:border-violet-500/25 dark:from-violet-950/40 dark:to-slate-950 dark:text-violet-50",
  informational:
    "border-sky-200/90 bg-gradient-to-br from-sky-50 to-white text-sky-950 dark:border-sky-500/25 dark:from-sky-950/40 dark:to-slate-950 dark:text-sky-50",
  retention:
    "border-teal-200/90 bg-gradient-to-br from-teal-50 to-white text-teal-950 dark:border-teal-500/25 dark:from-teal-950/40 dark:to-slate-950 dark:text-teal-50",
  custom:
    "border-indigo-200/90 bg-gradient-to-br from-indigo-50 to-white text-indigo-950 dark:border-indigo-500/25 dark:from-indigo-950/40 dark:to-slate-950 dark:text-indigo-50",
};

export function isCustomTemplatesEnabled(settings?: Record<string, unknown> | null) {
  return settings?.[CUSTOM_TEMPLATES_FEATURE_FLAG_KEY] === true;
}

export function slugFromTemplateName(name: string) {
  let base = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  if (!base) return "";
  if (!/^[a-z]/.test(base)) base = `t_${base}`;
  return base.slice(0, 64);
}

export function customTemplateCardTone(templateType?: string) {
  const key = String(templateType || "promotional").trim().toLowerCase();
  return TONE_BY_TYPE[key] || TONE_BY_TYPE.custom;
}

export function customTemplateTypeLabel(templateType?: string) {
  const hit = CUSTOM_TEMPLATE_TYPES.find(
    (t) => t.value === String(templateType || "").trim().toLowerCase(),
  );
  return hit?.label || "Custom";
}

export function validateCustomTemplateDraft(draft: {
  templateName?: string;
  templateCode?: string;
  messageBody?: string;
}) {
  const name = String(draft.templateName || "").trim();
  if (!name) return "Template name is required.";
  if (name.length > 80) return "Template name must be 80 characters or fewer.";
  const code = String(draft.templateCode || "").trim() || slugFromTemplateName(name);
  if (!code) return "Could not derive a template code from the name.";
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(code)) {
    return "Template code is invalid. Use letters, numbers, and underscores only.";
  }
  const reserved = new Set([
    "reminder",
    "monthreminder",
    "success",
    "fine",
    "deactivate",
    "hold",
    "welcome",
  ]);
  if (reserved.has(code.toLowerCase())) {
    return "That template code is reserved for system templates.";
  }
  const body = String(draft.messageBody ?? "");
  if (!body.trim()) return "Message body is required.";
  if (body.length > 8000) return "Message body must be 8000 characters or fewer.";
  return "";
}

export function friendlyCustomTemplateApiError(err: unknown) {
  const raw = String(
    (err as { message?: string; error?: string })?.message ||
      (err as { error?: string })?.error ||
      err ||
      "",
  ).trim();
  const map: Record<string, string> = {
    "template-name-required": "Template name is required.",
    "message-body-required": "Message body is required.",
    "invalid-template-type": "Choose a valid template type.",
    "invalid-gym-code-id": "Select a gym branch before saving.",
    "template-code-exists": "A template with this code already exists. Try a different name.",
    "reserved-template-code": "That template code is reserved for system templates.",
    "invalid-template-code":
      "Template code is invalid. Use lowercase letters, numbers, and underscores.",
    "custom-templates-feature-disabled": "Enable Custom WhatsApp Templates first.",
    "custom-template-not-found": "Template not found for this branch.",
    "no-updatable-fields": "Nothing to save — change the name, type, or message first.",
    "owner-required": "Only the master owner may permanently delete custom templates.",
  };
  return map[raw] || raw || "Could not save custom template.";
}
