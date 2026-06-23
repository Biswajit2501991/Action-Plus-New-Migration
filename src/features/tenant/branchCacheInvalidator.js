/**
 * Coordinated client cache invalidation on branch switch.
 */

import { invalidateAllBranchBrandingExcept } from '../branding/branchBrandingCache.js';
import { clearSettingsLookups } from '../settings/settingsBranchScope.js';

/**
 * @param {object} handlers - React setters and refs from App root
 * @param {string} nextBranchId
 */
export function invalidateCachesForBranchSwitch(handlers, nextBranchId) {
  const id = String(nextBranchId || '').trim();
  invalidateAllBranchBrandingExcept(id);

  if (typeof handlers.setMembers === 'function') handlers.setMembers([]);
  // Never clear visitors here — unsynced rows are lost before debounced bulk runs.
  // Branch-scoped hydrate replaces the in-memory list after the JWT switches.
  if (typeof handlers.setFinanceTransactions === 'function') handlers.setFinanceTransactions([]);
  if (typeof handlers.setSmsEvents === 'function') handlers.setSmsEvents([]);
  // Never clear logs here — unsynced rows are lost before POST /api/logs runs.
  // Branch-scoped hydrate replaces the in-memory list after the JWT switches.
  if (typeof handlers.setBackendHydrated === 'function') handlers.setBackendHydrated(false);
  if (typeof handlers.setTemplatesBranchId === 'function' && id) handlers.setTemplatesBranchId(id);

  if (typeof handlers.setSettings === 'function') {
    const clearFn = handlers.clearSettingsLookups || clearSettingsLookups;
    handlers.setSettings((prev) => (typeof clearFn === 'function' ? clearFn(prev) : prev));
  }

  if (handlers.whatsappTemplatesByBranch && typeof handlers.setWhatsappTemplatesByBranch === 'function') {
    handlers.setWhatsappTemplatesByBranch((prev) => {
      const next = { ...(prev && typeof prev === 'object' ? prev : {}) };
      for (const key of Object.keys(next)) {
        if (String(key) !== id) delete next[key];
      }
      return next;
    });
  }

  if (handlers.branchTemplateWarnShownRef) {
    handlers.branchTemplateWarnShownRef.current = false;
  }
}

export const branchCacheInvalidator = {
  onBranchSwitch: invalidateCachesForBranchSwitch,
};
