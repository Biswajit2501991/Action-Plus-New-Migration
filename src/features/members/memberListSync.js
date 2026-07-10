import {
  buildMembersFromServerWithPending,
  filterMembersExcludingTombstones,
  mergePendingMembersForDisplay,
  readMemberDeleteTombstones,
  reconcileMemberDeleteTombstones,
  sanitizeMembersForDisplay,
} from './memberDeleteTombstones.js';
import { mergeMemberDeltaIntoList } from './memberDeltaPull.js';

export {
  sanitizeMembersForDisplay,
  filterMembersExcludingTombstones,
  mergePendingMembersForDisplay,
  readMemberDeleteTombstones,
  reconcileMemberDeleteTombstones,
  mergeMemberDeltaIntoList,
  buildMembersFromServerWithPending,
};

/**
 * Full server hydrate/replace — tombstones always excluded from display list.
 */
export function membersListFromServerHydrate(remoteMembers, prev, options = {}) {
  const filteredRemote = filterMembersExcludingTombstones(remoteMembers);
  const list = buildMembersFromServerWithPending(filteredRemote, prev, options);
  return sanitizeMembersForDisplay(list);
}

/**
 * Incremental member pull — merges delta without dropping untouched rows.
 */
export function membersListFromServerDelta(prevMembers, deltaRemote, options = {}) {
  const { mergePair } = options;
  const merged = mergeMemberDeltaIntoList(prevMembers, deltaRemote, { mergePair });
  const scopeFn = options.scopeFn;
  if (typeof scopeFn === 'function') {
    return sanitizeMembersForDisplay(
      scopeFn(options.authUser, merged, options.activeBranchId),
    );
  }
  return merged;
}
