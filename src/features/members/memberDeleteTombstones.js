import { mergeMemberPhotoFields } from './memberAvatarResolver.js';

const STORAGE_KEY = 'apg.members.deletedTombstones';

export function readMemberDeleteTombstones() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? [...new Set(parsed.map((id) => String(id || '').trim()).filter(Boolean))] : [];
  } catch {
    return [];
  }
}

export function addMemberDeleteTombstone(memberId) {
  const id = String(memberId || '').trim();
  if (!id) return;
  const next = new Set(readMemberDeleteTombstones());
  next.add(id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
}

export function removeMemberDeleteTombstone(memberId) {
  const id = String(memberId || '').trim();
  if (!id) return;
  const next = readMemberDeleteTombstones().filter((x) => x !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function isMemberDeleteTombstoned(memberId, tombstones = null) {
  const id = String(memberId || '').trim();
  if (!id) return false;
  const list = tombstones || readMemberDeleteTombstones();
  return list.includes(id);
}

/**
 * Drop tombstones when the server confirms delete (member absent from remote).
 * Keep tombstones only while a local delete is still in flight (pendingDeleteIds).
 * Active members returned by GET /members clear stale tombstones (restored / re-added).
 */
export function reconcileMemberDeleteTombstones(remoteMembers, pendingDeleteIds = []) {
  const remoteIds = new Set(
    (Array.isArray(remoteMembers) ? remoteMembers : [])
      .map((m) => String(m?.memberId || '').trim())
      .filter(Boolean),
  );
  const pending = new Set(
    (Array.isArray(pendingDeleteIds) ? pendingDeleteIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );
  const kept = readMemberDeleteTombstones().filter((id) => pending.has(id) && remoteIds.has(id));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  return kept;
}

/** Keep pending local adds visible even when branch scope would filter them out. */
export function mergePendingMembersForDisplay(scopedMembers, allMembers, syncPending = null, tombstones = null) {
  const scoped = filterMembersExcludingTombstones(scopedMembers, tombstones);
  const scopedIds = new Set(
    scoped.map((m) => String(m?.memberId || '').trim()).filter(Boolean),
  );
  const pending = syncPending && typeof syncPending === 'object' ? syncPending : {};
  const tombstoneSet = tombstoneSetFromList(tombstones || readMemberDeleteTombstones());
  const optimistic = (Array.isArray(allMembers) ? allMembers : []).filter((m) => {
    const id = String(m?.memberId || '').trim();
    return id && pending[id] && !scopedIds.has(id) && !tombstoneSet.has(id);
  });
  return [...optimistic, ...scoped];
}

/** Member codes that are tombstoned but still returned by GET /members (delete must retry). */
export function tombstonedMembersStillOnServer(remoteMembers, tombstones = null) {
  const remoteIds = new Set(
    (Array.isArray(remoteMembers) ? remoteMembers : [])
      .map((m) => String(m?.memberId || '').trim())
      .filter(Boolean),
  );
  return (tombstones || readMemberDeleteTombstones()).filter((id) => remoteIds.has(id));
}

export function filterMembersExcludingTombstones(members, tombstones = null) {
  const tombstoneSet = tombstoneSetFromList(tombstones || readMemberDeleteTombstones());
  return (Array.isArray(members) ? members : [])
    .filter((m) => !tombstoneSet.has(String(m?.memberId || '').trim()));
}

/** Final guard for any React state update — deleted members never render in lists. */
export function sanitizeMembersForDisplay(members, tombstones = null) {
  return filterMembersExcludingTombstones(members, tombstones);
}

export function tombstoneSetFromList(tombstones) {
  return new Set(Array.isArray(tombstones) ? tombstones : []);
}

/**
 * Local-only row kept when pending sync; never when tombstoned (permanent delete).
 */
export function shouldKeepLocalOnlyMember(memberId, syncPending = null, tombstones = null) {
  const id = String(memberId || '').trim();
  if (!id) return false;
  if (isMemberDeleteTombstoned(id, tombstones)) return false;
  return Boolean(syncPending && syncPending[id]);
}

/**
 * Server is source of truth on hydrate/pull; keep only in-flight pending adds/edits.
 */
export function buildMembersFromServer(remoteMembers, {
  syncPending = null,
  tombstones = null,
  scopeFn = null,
  authUser = null,
  activeBranchId = '',
} = {}) {
  const pending = syncPending && typeof syncPending === 'object' ? syncPending : {};
  const tombstoneList = tombstones || readMemberDeleteTombstones();
  const tombstoneSet = tombstoneSetFromList(tombstoneList);
  let serverBase = (Array.isArray(remoteMembers) ? remoteMembers : [])
    .filter((m) => !tombstoneSet.has(String(m?.memberId || '').trim()));
  if (typeof scopeFn === 'function') {
    serverBase = scopeFn(authUser, serverBase, activeBranchId);
  }
  return serverBase;
}

/** @deprecated use buildMembersFromServer — pending locals merged in index when needed */
export function buildMembersFromServerWithPending(remoteMembers, prev, options = {}) {
  const serverList = buildMembersFromServer(remoteMembers, options);
  const prevList = Array.isArray(prev) ? prev : [];
  const prevById = new Map(
    prevList
      .map((m) => [String(m?.memberId || '').trim(), m])
      .filter(([id]) => id),
  );
  const mergedServer = serverList.map((remoteRow) => {
    const id = String(remoteRow?.memberId || '').trim();
    const localRow = id ? prevById.get(id) : null;
    if (!localRow) return remoteRow;
    const photoMeta = mergeMemberPhotoFields(localRow, remoteRow);
    return { ...remoteRow, ...photoMeta };
  });
  const pending = options.syncPending && typeof options.syncPending === 'object' ? options.syncPending : {};
  const tombstoneSet = tombstoneSetFromList(options.tombstones || readMemberDeleteTombstones());
  const serverIds = new Set(mergedServer.map((m) => String(m?.memberId || '').trim()));
  const pendingLocals = prevList.filter((m) => {
    const id = String(m?.memberId || '').trim();
    return id && pending[id] && !serverIds.has(id) && !tombstoneSet.has(id);
  });
  return [...mergedServer, ...pendingLocals];
}
