/**
 * Single source of truth for active branch context (client-side).
 * JWT + explicit branch switch win over localStorage pref and stale /auth/me refresh.
 */

import { effectiveActiveBranchId, writeActiveBranchPref } from './activeBranchContext.js';

const emptySnapshot = () => ({
  userId: '',
  activeBranchId: '',
  allowedBranchIds: [],
  assignedBranchIds: [],
  revision: 0,
});

let snapshot = emptySnapshot();
/** @type {{ userId: string, branchId: string } | null} */
let switchLock = null;
const listeners = new Set();

function notify() {
  snapshot = { ...snapshot, revision: snapshot.revision + 1 };
  for (const fn of listeners) {
    try { fn(getActiveBranchSnapshot()); } catch { /* ignore */ }
  }
}

export function getActiveBranchSnapshot() {
  return { ...snapshot, switchLocked: Boolean(switchLock) };
}

export function subscribeActiveBranch(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetActiveBranchStore() {
  snapshot = emptySnapshot();
  switchLock = null;
  notify();
}

export function isActiveBranchSwitchLocked() {
  return Boolean(switchLock);
}

/** Call before PATCH /auth/active-branch. */
export function beginActiveBranchSwitch(userId, branchId) {
  const uid = String(userId || '').trim();
  const bid = String(branchId || '').trim();
  switchLock = uid && bid ? { userId: uid, branchId: bid } : null;
  if (uid && bid) {
    snapshot = {
      ...snapshot,
      userId: uid,
      activeBranchId: bid,
    };
    notify();
  }
}

/** Call after successful PATCH with server-confirmed branch. */
export function commitActiveBranchSwitch({
  userId,
  branchId,
  allowedBranchIds,
  assignedBranchIds,
} = {}) {
  const uid = String(userId || snapshot.userId || '').trim();
  const bid = String(branchId || switchLock?.branchId || snapshot.activeBranchId || '').trim();
  if (!uid || !bid) return getActiveBranchSnapshot();
  snapshot = {
    userId: uid,
    activeBranchId: bid,
    allowedBranchIds: Array.isArray(allowedBranchIds) ? allowedBranchIds : snapshot.allowedBranchIds,
    assignedBranchIds: Array.isArray(assignedBranchIds) ? assignedBranchIds : snapshot.assignedBranchIds,
    revision: snapshot.revision,
  };
  writeActiveBranchPref(uid, bid);
  notify();
  return getActiveBranchSnapshot();
}

/** Call after branch hydrate completes (success or failure). */
export function endActiveBranchSwitch() {
  switchLock = null;
  notify();
}

/**
 * Authoritative active branch for UI + client scope.
 * Store snapshot wins when userId matches; otherwise effectiveActiveBranchId fallback.
 */
export function getAuthoritativeActiveBranchId(user, gymCodes = []) {
  const uid = String(user?.id || '').trim();
  const fromStore = String(snapshot.activeBranchId || '').trim();
  if (uid && snapshot.userId === uid && fromStore) return fromStore;
  if (switchLock && switchLock.userId === uid && switchLock.branchId) return switchLock.branchId;
  return effectiveActiveBranchId(user, gymCodes);
}

/** Merge authoritative branch into user row (both gymCodeId + activeBranchId). */
export function applyAuthoritativeBranchToUser(user, gymCodes = []) {
  if (!user?.id) return user;
  const active = getAuthoritativeActiveBranchId(user, gymCodes);
  if (!active) return user;
  const next = {
    ...user,
    activeBranchId: active,
    gymCodeId: active,
  };
  if (snapshot.userId === String(user.id) && snapshot.allowedBranchIds?.length) {
    next.allowedBranchIds = snapshot.allowedBranchIds;
  }
  if (snapshot.userId === String(user.id) && snapshot.assignedBranchIds?.length) {
    next.assignedBranchIds = snapshot.assignedBranchIds;
  }
  return next;
}

/**
 * Sync store from /auth/me or login payload.
 * Skips active-branch downgrade while switch lock is held.
 */
export function syncActiveBranchFromAuthPayload(userId, data = {}) {
  const uid = String(userId || data?.user?.id || data?.userId || '').trim();
  if (!uid) return getActiveBranchSnapshot();

  const authUser = data?.user || {};
  const fromAuth = String(
    authUser.activeBranchId
    || authUser.gymCodeId
    || data?.activeBranchId
    || data?.gymCodeId
    || '',
  ).trim();

  if (switchLock?.userId === uid && switchLock.branchId) {
    if (fromAuth && fromAuth !== switchLock.branchId) {
      return getActiveBranchSnapshot();
    }
  }

  const allowed = Array.isArray(data?.allowedBranchIds)
    ? data.allowedBranchIds
    : (Array.isArray(authUser.allowedBranchIds) ? authUser.allowedBranchIds : snapshot.allowedBranchIds);
  const assigned = Array.isArray(data?.assignedBranchIds)
    ? data.assignedBranchIds
    : (Array.isArray(authUser.assignedBranchIds) ? authUser.assignedBranchIds : snapshot.assignedBranchIds);

  snapshot = {
    userId: uid,
    activeBranchId: fromAuth || snapshot.activeBranchId || '',
    allowedBranchIds: allowed,
    assignedBranchIds: assigned,
    revision: snapshot.revision,
  };
  if (snapshot.activeBranchId) writeActiveBranchPref(uid, snapshot.activeBranchId);
  notify();
  return getActiveBranchSnapshot();
}

export const activeBranchStore = {
  getSnapshot: getActiveBranchSnapshot,
  subscribe: subscribeActiveBranch,
  reset: resetActiveBranchStore,
  isSwitchLocked: isActiveBranchSwitchLocked,
  beginSwitch: beginActiveBranchSwitch,
  commitSwitch: commitActiveBranchSwitch,
  endSwitch: endActiveBranchSwitch,
  getAuthoritativeActiveBranchId,
  applyToUser: applyAuthoritativeBranchToUser,
  syncFromAuthPayload: syncActiveBranchFromAuthPayload,
};
