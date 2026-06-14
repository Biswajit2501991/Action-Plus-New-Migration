import { describe, expect, it } from 'vitest';
import {
  assertValidCustomTemplateCode,
  assertValidCustomTemplateId,
  customTemplateRowToApp,
  assertCustomTemplatesFeatureEnabled,
  deleteBranchCustomTemplate,
} from '../backend/src/services/branchCustomTemplates.js';

const UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('branchCustomTemplates validation', () => {
  it('accepts valid custom template codes', () => {
    expect(assertValidCustomTemplateCode('promotion')).toBe('promotion');
    expect(assertValidCustomTemplateCode('festival_offer')).toBe('festival_offer');
  });

  it('rejects reserved system keys and invalid formats', () => {
    expect(() => assertValidCustomTemplateCode('reminder')).toThrow(/reserved-template-code/);
    expect(() => assertValidCustomTemplateCode('monthReminder')).toThrow(/invalid-template-code/);
    expect(() => assertValidCustomTemplateCode('Bad Code')).toThrow(/invalid-template-code/);
    expect(() => assertValidCustomTemplateCode('')).toThrow(/invalid-template-code/);
  });

  it('validates template ids as UUIDs', () => {
    expect(assertValidCustomTemplateId(UUID)).toBe(UUID);
    expect(() => assertValidCustomTemplateId('not-a-uuid')).toThrow(/invalid-template-id/);
  });

  it('maps database rows to API shape', () => {
    const app = customTemplateRowToApp({
      id: UUID,
      gym_code_id: UUID,
      template_code: 'promotion',
      template_name: 'Promotion',
      template_type: 'promotional',
      message_body: 'Hello',
      channel: 'whatsapp',
      is_active: true,
      status: 'active',
      created_by: 'owner',
      created_at: '2026-06-14T00:00:00.000Z',
      updated_at: '2026-06-14T00:00:00.000Z',
      sort_order: 2,
    });
    expect(app).toMatchObject({
      id: UUID,
      templateCode: 'promotion',
      templateName: 'Promotion',
      isActive: true,
      sortOrder: 2,
    });
  });

  it('blocks mutations when feature flag is disabled', () => {
    expect(() => assertCustomTemplatesFeatureEnabled(false)).toThrow(/custom-templates-feature-disabled/);
    expect(() => assertCustomTemplatesFeatureEnabled(undefined)).toThrow(/custom-templates-feature-disabled/);
    expect(assertCustomTemplatesFeatureEnabled(true)).toBeUndefined();
  });

  it('exposes hard delete service for custom templates', () => {
    expect(typeof deleteBranchCustomTemplate).toBe('function');
  });
});
