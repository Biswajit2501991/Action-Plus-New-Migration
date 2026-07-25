import { describe, expect, it } from 'vitest';
import { assertValidTemplateKey } from '../backend/src/services/branchWhatsappTemplates.js';

/** Mirror of frontend/src/lib/domain/whatsapp-system-edit.ts for contract tests. */
function canSaveSystemWhatsappTemplate(canEditTemplates, branchId) {
  return Boolean(canEditTemplates && String(branchId || '').trim());
}

function buildSystemTemplatePatchPayload(body, gymCodeId) {
  return { body: String(body ?? ''), gymCodeId: String(gymCodeId || '').trim() };
}

function validateSystemTemplateBody(body) {
  const text = String(body ?? '');
  if (!text.trim()) return 'Template body cannot be empty.';
  if (text.length > 8000) return 'Template body exceeds 8000 characters.';
  return '';
}

describe('WhatsApp system template edit contract', () => {
  it('accepts birthday as a valid template key for PATCH', () => {
    expect(assertValidTemplateKey('birthday')).toBe('birthday');
    expect(assertValidTemplateKey('welcome')).toBe('welcome');
    expect(assertValidTemplateKey('reminder')).toBe('reminder');
  });

  it('requires edit permission and a branch id before save', () => {
    expect(canSaveSystemWhatsappTemplate(true, 'branch-a')).toBe(true);
    expect(canSaveSystemWhatsappTemplate(false, 'branch-a')).toBe(false);
    expect(canSaveSystemWhatsappTemplate(true, '')).toBe(false);
    expect(canSaveSystemWhatsappTemplate(true, null)).toBe(false);
  });

  it('builds PATCH payload with body + gymCodeId', () => {
    expect(buildSystemTemplatePatchPayload('Hello [CustomerName]', 'uuid-1')).toEqual({
      body: 'Hello [CustomerName]',
      gymCodeId: 'uuid-1',
    });
  });

  it('rejects empty or oversized bodies', () => {
    expect(validateSystemTemplateBody('')).toMatch(/empty/i);
    expect(validateSystemTemplateBody('   ')).toMatch(/empty/i);
    expect(validateSystemTemplateBody('ok')).toBe('');
    expect(validateSystemTemplateBody('x'.repeat(8001))).toMatch(/8000/);
  });
});
