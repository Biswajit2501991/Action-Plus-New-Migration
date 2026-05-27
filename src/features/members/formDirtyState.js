/**
 * Reusable form dirty-state helpers for member edit flows.
 * Compares draft vs baseline using normalized equality per field type.
 */

/** Fields the Edit Member modal can change (must stay in sync with EditMemberModal UI). */
export const EDIT_MEMBER_DIRTY_KEYS = [
  'formNo',
  'memberId',
  'name',
  'email',
  'mobile',
  'plan',
  'status',
  'holdDuration',
  'billingDate',
  'amount',
  'paymentMethod',
  'assignedGymCodeId',
  'photo',
  'medicalAnswers',
];

export function normalizeBranchId(value) {
  const s = String(value ?? '').trim();
  return s;
}

/**
 * @param {unknown} a
 * @param {unknown} b
 * @param {string} key
 */
export function memberFieldValuesEqual(a, b, key) {
  if (key === 'medicalAnswers') {
    return JSON.stringify(a || {}) === JSON.stringify(b || {});
  }
  if (key === 'assignedGymCodeId') {
    return normalizeBranchId(a) === normalizeBranchId(b);
  }
  if (key === 'billingDate') {
    const sa = a == null || a === '' ? '' : String(a).slice(0, 10);
    const sb = b == null || b === '' ? '' : String(b).slice(0, 10);
    return sa === sb;
  }
  return String(a ?? '') === String(b ?? '');
}

/**
 * @param {Record<string, unknown>|null|undefined} draft
 * @param {Record<string, unknown>|null|undefined} baseline
 * @param {string[]} [keys]
 */
export function isMemberFormDirty(draft, baseline, keys = EDIT_MEMBER_DIRTY_KEYS) {
  if (!draft || !baseline) return false;
  return keys.some((key) => !memberFieldValuesEqual(draft[key], baseline[key], key));
}

/**
 * @param {Record<string, unknown>|null|undefined} draft
 * @param {Record<string, unknown>|null|undefined} baseline
 * @param {string[]} [keys]
 * @returns {Record<string, boolean>}
 */
export function memberFormChangedMap(draft, baseline, keys = EDIT_MEMBER_DIRTY_KEYS) {
  /** @type {Record<string, boolean>} */
  const out = {};
  if (!draft || !baseline) return out;
  for (const key of keys) {
    out[key] = !memberFieldValuesEqual(draft[key], baseline[key], key);
  }
  return out;
}

/**
 * Baseline snapshot for dirty checks — updates when saved member identity/timestamp changes.
 * @param {Record<string, unknown>|null|undefined} member
 */
export function memberEditBaselineKey(member) {
  if (!member) return '';
  const branch = normalizeBranchId(member.assignedGymCodeId);
  const updated = String(member.updatedAt || '').trim();
  return `${String(member.memberId || '')}|${branch}|${updated}`;
}
