/** Membership plan names containing the word "PT" (e.g. PT-Raja, PT-Deep). */
export const PT_PLAN_RE = /\bpt\b/i;

export function isPtPlanName(plan) {
  return PT_PLAN_RE.test(String(plan || ''));
}

/**
 * Active members on a PT plan qualify for PT Clients workflows.
 * @param {object|null|undefined} member
 */
export function isPtEligibleMember(member) {
  if (!member || typeof member !== 'object') return false;
  if (String(member.status || '') !== 'Active') return false;
  return isPtPlanName(member.plan);
}
