function toPositiveInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export function nextBranchFormNumber(members, gymCodeId) {
  const branchId = String(gymCodeId || '').trim();
  const list = Array.isArray(members) ? members : [];
  const nums = list
    .filter((m) => String(m?.assignedGymCodeId || '').trim() === branchId)
    .map((m) => toPositiveInt(m?.formNo))
    .filter(Boolean);
  const max = nums.length ? Math.max(...nums) : 0;
  return max + 1;
}

export function branchCodeToken(gymCodes, gymCodeId) {
  const branchId = String(gymCodeId || '').trim();
  const row = (Array.isArray(gymCodes) ? gymCodes : []).find((c) => String(c?.id || '') === branchId);
  const raw = String(row?.code || '').trim().toUpperCase();
  const safe = raw.replace(/[^A-Z0-9]/g, '');
  return safe || 'BR';
}

export function buildBranchMemberId(formNo, yearSuffix, branchToken) {
  const safeNo = String(formNo || '').trim();
  const safeYear = String(yearSuffix || '').trim();
  const safeBranch = String(branchToken || '').trim().toUpperCase() || 'BR';
  return `APG-${safeNo}/${safeYear}-${safeBranch}`;
}

