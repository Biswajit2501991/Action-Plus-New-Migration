import { describe, expect, it } from 'vitest';
import { normalizeSettingsScope, settingsScopeFlags, VALID_SETTINGS_SCOPES } from './settingsScope.js';

describe('normalizeSettingsScope', () => {
  it('accepts known scopes', () => {
    for (const scope of VALID_SETTINGS_SCOPES) {
      expect(normalizeSettingsScope(scope)).toBe(scope);
    }
  });

  it('defaults unknown scopes to full', () => {
    expect(normalizeSettingsScope('')).toBe('full');
    expect(normalizeSettingsScope('bad')).toBe('full');
    expect(normalizeSettingsScope(null)).toBe('full');
  });

  it('normalizes casing and whitespace', () => {
    expect(normalizeSettingsScope(' Core ')).toBe('core');
  });
});

describe('settingsScopeFlags', () => {
  it('core scope loads only core tables', () => {
    const f = settingsScopeFlags('core');
    expect(f.wantCore).toBe(true);
    expect(f.wantLeave).toBe(false);
    expect(f.wantPt).toBe(false);
  });

  it('leave scope is leave-only', () => {
    const f = settingsScopeFlags('leave');
    expect(f.wantCore).toBe(false);
    expect(f.wantLeave).toBe(true);
    expect(f.wantPt).toBe(false);
  });

  it('pt scope is pt-only', () => {
    const f = settingsScopeFlags('pt');
    expect(f.wantCore).toBe(false);
    expect(f.wantLeave).toBe(false);
    expect(f.wantPt).toBe(true);
  });
});
