import { describe, expect, it } from 'vitest';
import {
  slugFromTemplateName,
  customTemplateCardTone,
  validateCustomTemplateDraft,
  friendlyCustomTemplateApiError,
  resolveMemberCustomTemplatesFromCache,
  resolveCustomTemplateBodyFromCache,
  memberProfileCustomTemplateActions,
} from '../src/features/whatsapp/customTemplatesClient.js';

const BRANCH = 'branch-a';
const HQ = 'hq-branch';

describe('customTemplatesClient', () => {
  it('slugifies display names into valid template codes', () => {
    expect(slugFromTemplateName('Promotion')).toBe('promotion');
    expect(slugFromTemplateName('Festival Offer 2026')).toBe('festival_offer_2026');
    expect(slugFromTemplateName(' 99 Deal ')).toBe('t_99_deal');
  });

  it('rejects reserved codes in draft validation', () => {
    expect(validateCustomTemplateDraft({
      templateName: 'Reminder',
      templateCode: 'reminder',
      messageBody: 'Hi',
    })).toMatch(/invalid or reserved/);
  });

  it('returns tone classes by template type', () => {
    expect(customTemplateCardTone('promotional')).toContain('violet');
    expect(customTemplateCardTone('unknown')).toContain('indigo');
  });

  it('maps API errors to friendly messages', () => {
    expect(friendlyCustomTemplateApiError({ message: 'template-code-exists' }))
      .toMatch(/already exists/);
    expect(friendlyCustomTemplateApiError({ message: 'custom-templates-feature-disabled' }))
      .toMatch(/Enable Custom WhatsApp Templates/);
  });

  it('resolves member custom templates by assigned branch with HQ fallback', () => {
    const byBranch = {
      [BRANCH]: [{ templateCode: 'promotion', templateName: 'Promotion', isActive: true, status: 'active' }],
      [HQ]: [{ templateCode: 'festival', templateName: 'Festival', isActive: true, status: 'active' }],
    };
    const member = { assignedGymCodeId: BRANCH };
    expect(resolveMemberCustomTemplatesFromCache(byBranch, HQ, member)).toHaveLength(1);
    expect(resolveCustomTemplateBodyFromCache(byBranch, HQ, member, 'custom:promotion')).toBe('');
    const withBody = {
      [BRANCH]: [{ templateCode: 'promotion', templateName: 'Promotion', messageBody: 'Hi [CustomerName]', isActive: true, status: 'active' }],
    };
    expect(resolveCustomTemplateBodyFromCache(withBody, HQ, member, 'custom:promotion')).toBe('Hi [CustomerName]');
    expect(resolveMemberCustomTemplatesFromCache(byBranch, HQ, {})).toHaveLength(1);
    expect(memberProfileCustomTemplateActions(withBody, HQ, member)[0]).toMatchObject({
      key: 'custom:promotion',
      label: 'Promotion',
      isCustom: true,
    });
  });
});
