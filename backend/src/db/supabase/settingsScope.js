/** Supported GET /api/settings?scope= values. */
export const VALID_SETTINGS_SCOPES = new Set(['full', 'core', 'leave', 'pt']);

/**
 * @param {unknown} raw
 * @returns {'full' | 'core' | 'leave' | 'pt'}
 */
export function normalizeSettingsScope(raw) {
  const scope = String(raw || 'full').trim().toLowerCase();
  if (VALID_SETTINGS_SCOPES.has(scope)) return scope;
  return 'full';
}

export function settingsScopeFlags(scope) {
  const normalized = normalizeSettingsScope(scope);
  return {
    scope: normalized,
    wantCore: normalized === 'full' || normalized === 'core',
    wantLeave: normalized === 'full' || normalized === 'leave',
    wantPt: normalized === 'full' || normalized === 'pt',
  };
}
