/** Canonical WhatsApp template keys — keep in sync with WhatsAppSmsPage templateCards. */
export const WHATSAPP_TEMPLATE_KEYS = [
  'reminder',
  'monthReminder',
  'success',
  'fine',
  'deactivate',
  'hold',
  'welcome',
];

export function isWhatsappTemplateKey(key) {
  return WHATSAPP_TEMPLATE_KEYS.includes(String(key || '').trim());
}
