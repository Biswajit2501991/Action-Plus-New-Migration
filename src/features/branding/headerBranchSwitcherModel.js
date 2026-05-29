/**
 * Shared branch-switcher state for header branding block (no React).
 */

export function branchIdsForUser(user) {
  const allowedFn = typeof globalThis !== 'undefined' && globalThis.window?.__APG_MODULES?.allowedBranchIdsForUser;
  if (typeof allowedFn === 'function') return allowedFn(user) || [];
  const fromAllowed = Array.isArray(user?.allowedBranchIds) ? user.allowedBranchIds : [];
  const fromAssigned = Array.isArray(user?.assignedBranchIds) ? user.assignedBranchIds : [];
  const ids = [...fromAllowed, ...fromAssigned].map((x) => String(x || '').trim()).filter(Boolean);
  if (ids.length) return [...new Set(ids)];
  const single = String(user?.activeBranchId || user?.gymCodeId || '').trim();
  return single ? [single] : [];
}

/**
 * @param {{
 *   user: object | null,
 *   gymCodes?: object[],
 *   activeBranchId?: string,
 * }} params
 */
export function buildHeaderBranchSwitcherModel({ user, gymCodes = [], activeBranchId = '' }) {
  const listFn = globalThis.window?.__APG_MODULES?.switchableBranchesForUser;
  const showFn = globalThis.window?.__APG_MODULES?.shouldShowBranchSwitcher;
  const effectiveFn = globalThis.window?.__APG_MODULES?.effectiveActiveBranchId;

  const branchIds = branchIdsForUser(user);
  const branches = typeof listFn === 'function'
    ? listFn(user, gymCodes)
    : (() => {
      const byId = new Map((Array.isArray(gymCodes) ? gymCodes : []).map((c) => [String(c.id), c]));
      return branchIds.map((id) => byId.get(String(id)) || {
        id: String(id),
        code: String(id).slice(0, 8).toUpperCase(),
        name: 'Branch',
        branchName: 'Branch',
      });
    })();

  const multiBranch = Boolean(
    user
    && (typeof showFn === 'function'
      ? showFn(user, gymCodes)
      : branchIds.length > 1),
  );

  const active = String(
    activeBranchId
    || (typeof effectiveFn === 'function' ? effectiveFn(user, gymCodes) : '')
    || user?.activeBranchId
    || user?.gymCodeId
    || '',
  ).trim();

  return { branches, multiBranch, active, branchIds };
}
