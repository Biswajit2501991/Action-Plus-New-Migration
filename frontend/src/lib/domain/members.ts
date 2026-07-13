import type { Member } from "@/types";

export function normalizePhone(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

/** Production rule: exactly 10 digits, or +91 followed by 10 digits. */
export function isValidPhone(value?: string | null) {
  const raw = String(value || "").trim();
  return /^\d{10}$/.test(raw) || /^\+91\d{10}$/.test(raw);
}

export function isValidEmail(value?: string | null) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

export function ageFromDob(value?: string | null) {
  if (!value) return null;
  const dob = new Date(value);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

export function checkMemberDuplicates(
  members: Member[],
  candidate: Partial<Member>,
  excludeMemberId = "",
) {
  const list = Array.isArray(members) ? members : [];
  const candidatePhone = normalizePhone(candidate.mobile);
  const candidateEmail = String(candidate.email || "").trim().toLowerCase();
  const candidateMemberId = String(candidate.memberId || "").trim();

  return {
    duplicatePhone: list.some(
      (m) => m.memberId !== excludeMemberId && normalizePhone(m.mobile) === candidatePhone && candidatePhone,
    ),
    duplicateEmail:
      Boolean(candidateEmail) &&
      list.some(
        (m) =>
          m.memberId !== excludeMemberId &&
          String(m.email || "").trim().toLowerCase() === candidateEmail,
      ),
    duplicateMemberId:
      Boolean(candidateMemberId) &&
      list.some(
        (m) => m.memberId !== excludeMemberId && String(m.memberId || "").trim() === candidateMemberId,
      ),
  };
}

export function memberSearchHaystack(m: Member) {
  return [
    m.name,
    m.mobile,
    m.email,
    m.memberId,
    m.plan,
    m.status,
    m.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function countByStatus(members: Member[]) {
  const counts: Record<string, number> = {
    Active: 0,
    Hold: 0,
    Deactivated: 0,
    Cancelled: 0,
  };
  for (const m of members) {
    const status = String(m.status || "Active");
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

export function expiringSoon(members: Member[], withinDays = 14) {
  const now = Date.now();
  const limit = withinDays * 24 * 60 * 60 * 1000;
  return members.filter((m) => {
    if (!m.renewalDate) return false;
    const t = new Date(m.renewalDate).getTime();
    if (Number.isNaN(t)) return false;
    const diff = t - now;
    return diff >= 0 && diff <= limit;
  });
}

export function birthdaysThisMonth(members: Member[]) {
  const month = new Date().getMonth();
  return members.filter((m) => {
    if (!m.dob) return false;
    const d = new Date(m.dob);
    return !Number.isNaN(d.getTime()) && d.getMonth() === month;
  });
}

export function recentPayments(members: Member[], limit = 10) {
  const rows: { memberId: string; name?: string; amount: number; paidAt: string; method?: string }[] = [];
  for (const m of members) {
    for (const p of m.paymentHistory || []) {
      const paidAt = String(p.paidAt || p.paid_at || "");
      rows.push({
        memberId: m.memberId,
        name: m.name,
        amount: Number(p.amount || 0),
        paidAt,
        method: p.method,
      });
    }
  }
  return rows
    .filter((r) => r.paidAt)
    .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
    .slice(0, limit);
}
