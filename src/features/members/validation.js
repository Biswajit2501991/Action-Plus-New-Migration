import { asUTC } from '../../lib/utils.js';

export function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

export function isValidPhone(value) {
  const normalized = normalizePhone(value);
  return normalized.length >= 10 && normalized.length <= 15;
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

export function isValidDob(value) {
  const dob = asUTC(value);
  if (!dob) return false;
  const today = asUTC(new Date());
  return Boolean(today && dob <= today);
}

export function ageFromDob(value) {
  const dob = asUTC(value);
  if (!dob) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getUTCDate())) age -= 1;
  return age;
}

export function checkMemberDuplicates(members, candidate, excludeMemberId = '') {
  const list = Array.isArray(members) ? members : [];
  const candidatePhone = normalizePhone(candidate.mobile);
  const candidateEmail = String(candidate.email || '').trim().toLowerCase();
  const candidateMemberId = String(candidate.memberId || '').trim();

  return {
    duplicatePhone: list.some((m) => m.memberId !== excludeMemberId && normalizePhone(m.mobile) === candidatePhone),
    duplicateEmail: Boolean(candidateEmail) && list.some((m) => m.memberId !== excludeMemberId && String(m.email || '').trim().toLowerCase() === candidateEmail),
    duplicateMemberId: Boolean(candidateMemberId) && list.some((m) => m.memberId !== excludeMemberId && String(m.memberId || '').trim() === candidateMemberId),
  };
}
