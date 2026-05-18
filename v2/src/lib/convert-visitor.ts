import type { Visitor } from '@/features/visitors/visitors.types';

export const CONVERT_VISITOR_STORAGE_KEY = 'apg.convertVisitor';

/** Hand off to legacy index.html Add Member wizard (same as sidebar Convert in old Visitors). */
export function redirectToLegacyMemberConvert(visitor: Visitor) {
  try {
    localStorage.removeItem('apg.addMemberDraft');
  } catch {
    /* ignore */
  }
  sessionStorage.setItem(
    CONVERT_VISITOR_STORAGE_KEY,
    JSON.stringify({
      id: visitor.id,
      fullName: visitor.fullName,
      email: visitor.email,
      mobile: visitor.mobile,
      dob: visitor.dob,
      gender: visitor.gender,
    }),
  );
  window.location.assign('/index.html');
}
