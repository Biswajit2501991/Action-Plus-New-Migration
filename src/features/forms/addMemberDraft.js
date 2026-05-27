import { safeGetJSON, safeSetJSON } from '../../lib/storage.js';
import { authIsOwnerUser } from '../branch/branchAccess.js';

export const ADD_MEMBER_DRAFT_KEY = 'apg.addMemberDraft';

/** Per-user draft key so owner HQ drafts do not leak to staff sessions. */
export function addMemberDraftKeyForUser(user) {
  if (!user) return ADD_MEMBER_DRAFT_KEY;
  if (authIsOwnerUser(user)) return `${ADD_MEMBER_DRAFT_KEY}::owner`;
  const id = String(user.id || user.staffId || user.userId || 'staff').trim().toLowerCase() || 'staff';
  return `${ADD_MEMBER_DRAFT_KEY}::${id}`;
}

export function loadAddMemberDraft(storage = window.localStorage, user = null) {
  const key = addMemberDraftKeyForUser(user);
  const scoped = safeGetJSON(storage, key, null);
  if (scoped) return scoped;
  if (user && !authIsOwnerUser(user)) {
    return safeGetJSON(storage, ADD_MEMBER_DRAFT_KEY, null);
  }
  return scoped;
}

export function saveAddMemberDraft(storage = window.localStorage, userOrPayload = null, payloadMaybe = undefined) {
  const hasUserArg = payloadMaybe !== undefined;
  const user = hasUserArg ? userOrPayload : null;
  const payload = hasUserArg ? payloadMaybe : userOrPayload;
  if (!payload) return { ok: false, reason: 'empty-payload' };
  const key = addMemberDraftKeyForUser(user);
  return safeSetJSON(storage, key, payload);
}

export function clearAddMemberDraft(storage = window.localStorage, user = null) {
  try {
    if (user) {
      storage.removeItem(addMemberDraftKeyForUser(user));
      return { ok: true, reason: '' };
    }
    storage.removeItem(ADD_MEMBER_DRAFT_KEY);
    const prefix = `${ADD_MEMBER_DRAFT_KEY}::`;
    const toRemove = [];
    for (let i = 0; i < storage.length; i += 1) {
      const k = storage.key(i);
      if (k && (k === ADD_MEMBER_DRAFT_KEY || k.startsWith(prefix))) toRemove.push(k);
    }
    toRemove.forEach((k) => storage.removeItem(k));
    return { ok: true, reason: '' };
  } catch {
    return { ok: false, reason: 'remove-failed' };
  }
}
