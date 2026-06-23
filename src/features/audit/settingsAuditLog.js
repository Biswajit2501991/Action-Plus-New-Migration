/**
 * Build audit before/after payloads for settings.updated events.
 * PT client profiles log a single member slice (not the full map).
 */

/**
 * @param {string} key settings key (e.g. plans, ptClientProfiles)
 * @param {unknown} baseline previous value from setState prev[key]
 * @param {unknown} nextValue resolved next value
 * @param {{ audit?: boolean, memberId?: string }} [options]
 * @returns {{ entityId: string, before: unknown, after: unknown }|null}
 */
export function buildSettingsAuditPayload(key, baseline, nextValue, options = {}) {
  if (options.audit === false) return null;
  const memberId = String(options.memberId || '').trim();
  if (key === 'ptClientProfiles' && memberId) {
    const beforeAll = baseline && typeof baseline === 'object' ? baseline : {};
    const afterAll = nextValue && typeof nextValue === 'object' ? nextValue : {};
    return {
      entityId: `ptClientProfiles:${memberId}`,
      before: beforeAll[memberId] ?? null,
      after: afterAll[memberId] ?? null,
    };
  }
  return {
    entityId: String(key || ''),
    before: baseline ?? null,
    after: nextValue ?? null,
  };
}
