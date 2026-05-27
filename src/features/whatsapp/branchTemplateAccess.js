/**
 * Client-side branch template helpers (server enforces on API).
 */

export function authIsOwnerUser(user) {
  if (!user) return false;
  const id = String(user.id || '').trim().toLowerCase();
  const role = String(user.role || '').trim().toLowerCase();
  return id === 'owner' || role === 'owner';
}

export function staffMayEditWhatsappTemplates(user) {
  if (!user) return false;
  if (authIsOwnerUser(user)) return true;
  const access = user.access && typeof user.access === 'object' ? user.access : {};
  return access.whatsapp?.viewTemplates !== false;
}

export function effectiveTemplateBranchIdForUser(user, ownerSelectedBranchId) {
  if (authIsOwnerUser(user)) {
    return String(ownerSelectedBranchId || user?.gymCodeId || '').trim();
  }
  return String(user?.gymCodeId || '').trim();
}

/**
 * Pick template map for a member from branch-scoped cache.
 * @param {Record<string, Record<string, string>>} templatesByBranch - gymCodeId -> { key: body }
 * @param {string|null} hqGymCodeId
 * @param {{ assignedGymCodeId?: string|null }} member
 * @param {string} templateKey
 * @returns {{ body: string, gymCodeId: string, usedHqFallback: boolean }|null}
 */
export function resolveMemberTemplateFromCache(templatesByBranch, hqGymCodeId, member, templateKey) {
  const key = String(templateKey || '').trim();
  if (!key) return null;
  let branchId = String(member?.assignedGymCodeId || '').trim();
  let usedHqFallback = false;
  if (!branchId) {
    branchId = String(hqGymCodeId || '').trim();
    usedHqFallback = Boolean(branchId);
  }
  if (!branchId) return null;
  const map = templatesByBranch?.[branchId];
  const body = map?.[key];
  if (body != null && body !== '') {
    return { body, gymCodeId: branchId, usedHqFallback };
  }
  const hq = String(hqGymCodeId || '').trim();
  if (hq && hq !== branchId) {
    const hqBody = templatesByBranch?.[hq]?.[key];
    if (hqBody != null && hqBody !== '') {
      return { body: hqBody, gymCodeId: hq, usedHqFallback: true };
    }
  }
  return null;
}
