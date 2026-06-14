import { describe, expect, it } from 'vitest';
import {
  normalizeWhatsAppTemplateKey,
  whatsappSendAuditAction,
  whatsappSendAuditEntityType,
  whatsappSendAuditEntityId,
  buildWhatsAppSendMemberPatch,
  buildWhatsAppMissingPhonePatch,
  buildWhatsAppSendUrl,
  formatWhatsAppPhone,
} from '../src/features/whatsapp/whatsappSendFlow.js';

const BRANCH = 'branch-a';
const HQ = 'hq-branch';

describe('whatsappSendFlow', () => {
  it('namespaces known custom template codes', () => {
    const ctx = {
      customTemplatesByBranch: {
        [BRANCH]: [{ templateCode: 'promotion', templateName: 'Promotion', isActive: true, status: 'active' }],
      },
      hqGymCodeId: HQ,
      member: { assignedGymCodeId: BRANCH },
    };
    expect(normalizeWhatsAppTemplateKey('promotion', ctx)).toBe('custom:promotion');
    expect(normalizeWhatsAppTemplateKey('custom:promotion', ctx)).toBe('custom:promotion');
    expect(normalizeWhatsAppTemplateKey('reminder', ctx)).toBe('reminder');
  });

  it('uses custom_template.sent audit action for custom keys', () => {
    expect(whatsappSendAuditAction('custom:promotion')).toBe('custom_template.sent');
    expect(whatsappSendAuditAction('reminder')).toBe('sms.reminder.opened');
    expect(whatsappSendAuditEntityType('custom:promotion')).toBe('custom_template');
    expect(whatsappSendAuditEntityId('custom:promotion', { assignedGymCodeId: BRANCH }, { hqGymCodeId: HQ }))
      .toBe(`${BRANCH}:promotion`);
  });

  it('builds member send patches with namespaced history keys', () => {
    const member = {
      memberId: 'M1',
      lastSmsSent: { reminder: { sentAt: 'old', sentBy: 'Staff' } },
      messageHistory: [{ id: 'h1', templateKey: 'reminder' }],
    };
    const patch = buildWhatsAppSendMemberPatch(member, 'custom:promotion', {
      sentAt: '2026-06-14T12:00:00.000Z',
      sentBy: 'Owner',
      createId: () => 'evt-1',
    });
    expect(patch.lastSmsSent['custom:promotion']).toEqual({
      sentAt: '2026-06-14T12:00:00.000Z',
      sentBy: 'Owner',
    });
    expect(patch.messageHistory[0]).toMatchObject({
      id: 'evt-1',
      templateKey: 'custom:promotion',
      status: 'opened',
    });
    expect(patch.reminderSentAt).toBeUndefined();
  });

  it('tracks reminderSentAt only for reminder template', () => {
    const patch = buildWhatsAppSendMemberPatch({ messageHistory: [] }, 'reminder', {
      sentAt: '2026-06-14T12:00:00.000Z',
      sentBy: 'Staff',
      createId: () => 'evt-2',
    });
    expect(patch.reminderSentAt).toBe('2026-06-14T12:00:00.000Z');
  });

  it('formats phone numbers and wa.me URLs', () => {
    expect(formatWhatsAppPhone('9876543210')).toBe('919876543210');
    expect(buildWhatsAppSendUrl('9876543210', 'Hello')).toContain('api.whatsapp.com/send');
    expect(buildWhatsAppMissingPhonePatch({ messageHistory: [] }, 'custom:promotion', { createId: () => 'f1' })
      .messageHistory[0]).toMatchObject({ status: 'failed', reason: 'missing_phone' });
  });
});
