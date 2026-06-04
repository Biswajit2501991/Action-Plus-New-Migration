import { filterMembersExcludingTombstones } from './memberDeleteTombstones.js';

/**
 * Apply incremental GET /members?updatedSince rows onto the full in-memory list.
 * Members absent from the delta payload are kept (unlike full list-replace merge).
 *
 * @param {object[]} prevMembers
 * @param {object[]} deltaRemote
 * @param {{ mergePair?: (local: object, remote: object) => object }} [options]
 */
export function mergeMemberDeltaIntoList(prevMembers, deltaRemote, options = {}) {
  const prev = Array.isArray(prevMembers) ? prevMembers : [];
  const delta = filterMembersExcludingTombstones(
    Array.isArray(deltaRemote) ? deltaRemote : [],
  );
  if (!delta.length) return prev;

  const remoteById = new Map();
  for (const m of delta) {
    const id = String(m?.memberId || '').trim();
    if (id) remoteById.set(id, m);
  }

  const mergePair = typeof options.mergePair === 'function' ? options.mergePair : null;
  const merged = prev.map((localRow) => {
    const id = String(localRow?.memberId || '').trim();
    const remoteRow = id ? remoteById.get(id) : null;
    if (!remoteRow) return localRow;
    remoteById.delete(id);
    if (mergePair) return mergePair(localRow, remoteRow);
    return { ...localRow, ...remoteRow };
  });

  for (const remoteRow of remoteById.values()) {
    merged.push(remoteRow);
  }
  return merged;
}
