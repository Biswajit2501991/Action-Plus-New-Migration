import { toTs } from './utils.js';

/** Legacy writes used this when DOB was missing — never persist over a real birthday. */
export const MEMBER_DOB_PLACEHOLDER = '1970-01-01';

export function isValidMemberDob(dob) {
  const s = String(dob || '').trim().slice(0, 10);
  return Boolean(s && s !== MEMBER_DOB_PLACEHOLDER);
}

function updatedAtMs(value) {
  const parsed = toTs(value);
  if (!parsed) return 0;
  const ms = Date.parse(parsed);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Bulk PUT carries debounced browser snapshots (legacy index.html + offline queue).
 * PATCH updates (e.g. Member Birthday) must not be clobbered by a stale bulk row.
 */
export function preserveProfileFieldsOnBulkRow(incomingRow, existingRow, appMember = null) {
  if (!incomingRow || !existingRow) return incomingRow;
  const row = { ...incomingRow };

  const exMs = updatedAtMs(existingRow.updated_at);
  const inMs = Math.max(
    updatedAtMs(incomingRow.updated_at),
    updatedAtMs(appMember?.updatedAt),
  );
  const staleSnapshot = Boolean(exMs && inMs && inMs < exMs);

  if (!isValidMemberDob(row.dob) && isValidMemberDob(existingRow.dob)) {
    row.dob = existingRow.dob;
  } else if (staleSnapshot && isValidMemberDob(existingRow.dob)) {
    row.dob = existingRow.dob;
  }

  if (staleSnapshot) {
    const gender = String(existingRow.gender || '').trim();
    const address = String(existingRow.address || '').trim();
    if (gender && !String(row.gender || '').trim()) row.gender = existingRow.gender;
    if (address && !String(row.address || '').trim()) row.address = existingRow.address;
  }

  return row;
}
