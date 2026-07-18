import type { WhatsAppTemplateKey } from "@/lib/domain/whatsapp-templates";

/** Whether system WhatsApp template Edit/Save may run for the current branch. */
export function canSaveSystemWhatsappTemplate(
  canEditTemplates: boolean,
  branchId: string | null | undefined,
) {
  return Boolean(canEditTemplates && String(branchId || "").trim());
}

/** PATCH /whatsapp-templates/:key body. */
export function buildSystemTemplatePatchPayload(
  body: string,
  gymCodeId: string,
): { body: string; gymCodeId: string } {
  return {
    body: String(body ?? ""),
    gymCodeId: String(gymCodeId || "").trim(),
  };
}

export function systemTemplateEditorTitle(
  key: WhatsAppTemplateKey | string,
  title?: string,
) {
  const label = String(title || key || "template").trim();
  return `Edit ${label}`;
}

/** Reject empty saves that would wipe a template unintentionally. */
export function validateSystemTemplateBody(body: string) {
  const text = String(body ?? "");
  if (!text.trim()) return "Template body cannot be empty.";
  if (text.length > 8000) return "Template body exceeds 8000 characters.";
  return "";
}
