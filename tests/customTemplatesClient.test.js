import { describe, expect, it } from 'vitest';
import {
  slugFromTemplateName,
  customTemplateCardTone,
  validateCustomTemplateDraft,
  friendlyCustomTemplateApiError,
} from '../src/features/whatsapp/customTemplatesClient.js';

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
});
