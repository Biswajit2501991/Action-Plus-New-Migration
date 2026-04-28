import { safeGetJSON, safeSetJSON } from '../../lib/storage.js';

export const ADD_MEMBER_DRAFT_KEY = 'apg.addMemberDraft';

export function loadAddMemberDraft(storage = window.localStorage) {
  return safeGetJSON(storage, ADD_MEMBER_DRAFT_KEY, null);
}

export function saveAddMemberDraft(storage = window.localStorage, payload = null) {
  if (!payload) return { ok: false, reason: 'empty-payload' };
  return safeSetJSON(storage, ADD_MEMBER_DRAFT_KEY, payload);
}

export function clearAddMemberDraft(storage = window.localStorage) {
  try {
    storage.removeItem(ADD_MEMBER_DRAFT_KEY);
    return { ok: true, reason: '' };
  } catch {
    return { ok: false, reason: 'remove-failed' };
  }
}
