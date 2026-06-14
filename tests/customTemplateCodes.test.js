import { describe, expect, it } from 'vitest';
import {
  RESERVED_SYSTEM_TEMPLATE_CODES,
  customTemplateHistoryKey,
  isCustomTemplateHistoryKey,
  isValidCustomTemplateCode,
  parseCustomTemplateHistoryKey,
} from '../src/features/whatsapp/customTemplateCodes.js';

describe('customTemplateCodes', () => {
  it('reserves all system WhatsApp template keys', () => {
    expect(RESERVED_SYSTEM_TEMPLATE_CODES).toContain('reminder');
    expect(RESERVED_SYSTEM_TEMPLATE_CODES).toContain('monthreminder');
    expect(RESERVED_SYSTEM_TEMPLATE_CODES).toContain('welcome');
  });

  it('accepts valid custom slugs', () => {
    expect(isValidCustomTemplateCode('promotion')).toBe(true);
    expect(isValidCustomTemplateCode('festival_offer')).toBe(true);
  });

  it('rejects system keys and invalid formats', () => {
    expect(isValidCustomTemplateCode('reminder')).toBe(false);
    expect(isValidCustomTemplateCode('monthReminder')).toBe(false);
    expect(isValidCustomTemplateCode('Promotion')).toBe(false);
    expect(isValidCustomTemplateCode('')).toBe(false);
  });

  it('namespaces history keys without altering system keys', () => {
    expect(customTemplateHistoryKey('promotion')).toBe('custom:promotion');
    expect(isCustomTemplateHistoryKey('custom:promotion')).toBe(true);
    expect(isCustomTemplateHistoryKey('reminder')).toBe(false);
    expect(parseCustomTemplateHistoryKey('custom:promotion')).toBe('promotion');
  });
});
