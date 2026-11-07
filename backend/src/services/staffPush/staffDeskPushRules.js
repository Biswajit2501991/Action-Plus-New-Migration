import { normalizeAccess } from '../../auth/accessControl.js';
import { normalizeStaffRole, STAFF_ROLES } from '../../auth/tenant/roles.js';

export const STAFF_VISITOR_TITLE = 'New visitor';
export const STAFF_VISITOR_BODY = 'New visitor added. Log in to the Gym app to check.';
export const STAFF_CHAT_TITLE = 'Portal Chat';

export function staffChatBody(memberName) {
  const name = String(memberName || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  const who = name || 'A member';
  return `${who} has sent a message. Log in to reply.`;
}

export function isMasterStaff(user) {
  return normalizeStaffRole(user?.staffRole, user?.id) === STAFF_ROLES.MASTER_OWNER;
}

export function staffSeesBranch(user, branchId) {
  if (!user || user.blocked) return false;
  if (isMasterStaff(user)) return true;
  const branch = String(branchId || '').trim();
  if (!branch) return false;
  const ids = new Set(
    [...(Array.isArray(user.assignedBranchIds) ? user.assignedBranchIds : []), user.gymCodeId]
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );
  return ids.has(branch);
}

export function staffCanViewVisitors(user) {
  if (!user || user.blocked) return false;
  if (isMasterStaff(user)) return true;
  const sections = Array.isArray(user.sections) ? user.sections : [];
  if (!sections.includes('Members')) return false;
  const access = normalizeAccess(user.access || {});
  return access.members.viewVisitors !== false;
}

/** Same people who can open Portal Chat in the menu. */
export function staffCanPortalChat(user) {
  if (!user || user.blocked) return false;
  if (isMasterStaff(user)) return true;
  const sections = Array.isArray(user.sections) ? user.sections : [];
  const listed = sections.includes('WhatsApp Verification') || sections.includes('Members');
  if (!listed) return false;
  const access = normalizeAccess(user.access || {});
  return access.whatsappVerification.viewPortalChat !== false
    || access.members.editMembers !== false
    || access.members.viewMembers !== false;
}

export function staffShouldGetVisitorAlert(user, branchId) {
  return staffCanViewVisitors(user) && staffSeesBranch(user, branchId);
}

export function staffShouldGetChatAlert(user, branchId) {
  return staffCanPortalChat(user) && staffSeesBranch(user, branchId);
}
