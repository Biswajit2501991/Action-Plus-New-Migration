import { authIsOwnerUser } from './branchAccess.js';

/**
 * Default gym branch for new member/visitor forms.
 * Staff never fall back to HQ — only their JWT branch (or blank until hydrated).
 */
export function resolveDefaultAssignedGymCodeId(user, { hqGymCodeId = null, gymCodes = [] } = {}) {
  if (authIsOwnerUser(user)) {
    return String(hqGymCodeId || gymCodes?.[0]?.id || '').trim();
  }
  return String(user?.gymCodeId || '').trim();
}

/**
 * Enforce branch on form payload: staff are always pinned to their branch.
 */
export function enforceStaffBranchOnForm(assignedGymCodeId, user, options = {}) {
  if (authIsOwnerUser(user)) {
    const trimmed = String(assignedGymCodeId || '').trim();
    if (trimmed) return trimmed;
    return resolveDefaultAssignedGymCodeId(user, options);
  }
  const staffBranch = String(user?.gymCodeId || '').trim();
  if (staffBranch) return staffBranch;
  return String(assignedGymCodeId || '').trim();
}

/** Sanitize draft restore so staff never keep owner/HQ branch from a shared legacy key. */
export function sanitizeAddMemberDraftForm(form, user, options = {}) {
  if (!form || typeof form !== 'object') return form;
  const nextBranch = enforceStaffBranchOnForm(form.assignedGymCodeId, user, options);
  if (String(form.assignedGymCodeId || '').trim() === nextBranch) return form;
  return { ...form, assignedGymCodeId: nextBranch };
}
