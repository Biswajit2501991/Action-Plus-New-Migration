import {
  customTemplateHistoryKey,
  isCustomTemplateHistoryKey,
  parseCustomTemplateHistoryKey,
} from './customTemplateCodes.js';
import { resolveMemberCustomTemplatesFromCache } from './customTemplatesClient.js';

const MESSAGE_HISTORY_LIMIT = 50;

export function normalizeWhatsAppTemplateKey(templateKey, context = {}) {
  const raw = String(templateKey || '').trim();
  if (!raw) return '';
  if (isCustomTemplateHistoryKey(raw)) return raw;

  const { customTemplatesByBranch = {}, hqGymCodeId = null, member = {} } = context;
  const code = raw.toLowerCase();
  const templates = resolveMemberCustomTemplatesFromCache(customTemplatesByBranch, hqGymCodeId, member);
  const hit = templates.find((t) => String(t.templateCode || '').trim().toLowerCase() === code);
  if (hit) return customTemplateHistoryKey(hit.templateCode);

  return raw;
}

export function whatsappSendAuditAction(templateKey) {
  if (isCustomTemplateHistoryKey(templateKey)) return 'custom_template.sent';
  const raw = String(templateKey || 'unknown').trim() || 'unknown';
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `sms.${safe}.opened`;
}

export function whatsappSendAuditEntityType(templateKey) {
  return isCustomTemplateHistoryKey(templateKey) ? 'custom_template' : 'member';
}

export function whatsappSendAuditEntityId(templateKey, member, branchContext = {}) {
  if (isCustomTemplateHistoryKey(templateKey)) {
    const code = parseCustomTemplateHistoryKey(templateKey) || 'unknown';
    const branchId = String(
      member?.assignedGymCodeId
      || branchContext.hqGymCodeId
      || '',
    ).trim();
    return branchId ? `${branchId}:${code}` : code;
  }
  return String(member?.memberId || '').trim();
}

export function formatWhatsAppPhone(mobile) {
  const cleanPhone = String(mobile || '').replace(/\D/g, '');
  if (!cleanPhone) return '';
  return cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
}

export function buildWhatsAppSendUrl(mobile, message) {
  const finalPhone = formatWhatsAppPhone(mobile);
  if (!finalPhone) return '';
  return `https://api.whatsapp.com/send?phone=${finalPhone}&text=${encodeURIComponent(message || '')}`;
}

function buildHistoryEntry(templateKey, meta = {}) {
  const sentAt = String(meta.sentAt || new Date().toISOString());
  const sentBy = String(meta.sentBy || '').trim();
  const createId = typeof meta.createId === 'function' ? meta.createId : () => crypto.randomUUID();
  return {
    id: createId(),
    channel: meta.channel || 'whatsapp',
    templateKey,
    status: meta.status || 'opened',
    ts: sentAt,
    sentAt,
    sentBy,
    ...(meta.reason ? { reason: meta.reason } : {}),
  };
}

export function buildWhatsAppMissingPhonePatch(member, templateKey, meta = {}) {
  const ts = String(meta.ts || new Date().toISOString());
  const history = Array.isArray(member?.messageHistory) ? member.messageHistory : [];
  return {
    messageHistory: [
      buildHistoryEntry(templateKey, {
        ...meta,
        sentAt: ts,
        status: 'failed',
        reason: 'missing_phone',
      }),
      ...history,
    ].slice(0, MESSAGE_HISTORY_LIMIT),
  };
}

/** Namespaced lastSmsSent + messageHistory patch for WhatsApp template sends. */
export function buildWhatsAppSendMemberPatch(member, templateKey, meta = {}) {
  const sentAt = String(meta.sentAt || new Date().toISOString());
  const sentBy = String(meta.sentBy || '').trim();
  const history = Array.isArray(member?.messageHistory) ? member.messageHistory : [];
  const patch = {
    updatedAt: sentAt,
    lastSmsSent: {
      ...(member?.lastSmsSent && typeof member.lastSmsSent === 'object' ? member.lastSmsSent : {}),
      [templateKey]: { sentAt, sentBy },
    },
    messageHistory: [
      buildHistoryEntry(templateKey, { ...meta, sentAt, sentBy }),
      ...history,
    ].slice(0, MESSAGE_HISTORY_LIMIT),
  };
  if (templateKey === 'reminder') {
    patch.reminderSentAt = sentAt;
  }
  return patch;
}

export function whatsappSendAuditMeta(templateKey, member, extra = {}) {
  const code = parseCustomTemplateHistoryKey(templateKey);
  return {
    memberName: member?.name || '',
    templateKey,
    templateCode: code || undefined,
    templateLabel: extra.templateLabel || templateKey,
    source: extra.source || 'whatsapp_send',
    mobile: extra.mobile || '',
    channel: 'whatsapp',
  };
}
