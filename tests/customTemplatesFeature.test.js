import { describe, expect, it } from 'vitest';
import {
  CUSTOM_TEMPLATES_FEATURE_FLAG_KEY,
  isCustomTemplatesEnabled,
  normalizeCustomTemplatesEnabled,
  canManageCustomTemplatesFeatureFlag,
} from '../src/features/whatsapp/customTemplatesFeature.js';

describe('customTemplatesFeature', () => {
  it('exposes stable feature flag key', () => {
    expect(CUSTOM_TEMPLATES_FEATURE_FLAG_KEY).toBe('customTemplatesEnabled');
  });

  it('is disabled by default when settings are missing', () => {
    expect(isCustomTemplatesEnabled(null)).toBe(false);
    expect(isCustomTemplatesEnabled(undefined)).toBe(false);
    expect(isCustomTemplatesEnabled({})).toBe(false);
  });

  it('is disabled when flag is explicitly false', () => {
    expect(isCustomTemplatesEnabled({ customTemplatesEnabled: false })).toBe(false);
  });

  it('is enabled only when flag is explicitly true', () => {
    expect(isCustomTemplatesEnabled({ customTemplatesEnabled: true })).toBe(true);
    expect(isCustomTemplatesEnabled({ customTemplatesEnabled: 'true' })).toBe(false);
    expect(isCustomTemplatesEnabled({ customTemplatesEnabled: 1 })).toBe(false);
  });

  it('normalizes persisted values to strict boolean', () => {
    expect(normalizeCustomTemplatesEnabled(true)).toBe(true);
    expect(normalizeCustomTemplatesEnabled(false)).toBe(false);
    expect(normalizeCustomTemplatesEnabled('true')).toBe(false);
    expect(normalizeCustomTemplatesEnabled(undefined)).toBe(false);
  });

  it('allows master owner to manage the rollout flag', () => {
    expect(canManageCustomTemplatesFeatureFlag({ id: 'owner' })).toBe(true);
    expect(canManageCustomTemplatesFeatureFlag({ id: 'alice', role: 'master_owner' })).toBe(true);
    expect(canManageCustomTemplatesFeatureFlag({ id: 'bob', staffRole: 'owner' })).toBe(true);
    expect(canManageCustomTemplatesFeatureFlag({ id: 'carol', role: 'branch_owner' })).toBe(false);
    expect(canManageCustomTemplatesFeatureFlag({ id: 'dave', role: 'staff' })).toBe(false);
  });
});
