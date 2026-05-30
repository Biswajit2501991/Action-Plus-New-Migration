/**
 * Branch-scoped branding cache keyed by gymCodeId.
 * Used by sidebar/header after branch switch (single invalidation path).
 */

import { resolveClientBranchBranding, defaultClientBranding } from './branchBranding.js';
import { getAuthoritativeActiveBranchId } from './activeBranchStore.js';

/** @type {Map<string, object>} */
const cache = new Map();

export function peekBranchBranding(branchId) {
  const id = String(branchId || '').trim();
  if (!id) return null;
  const hit = cache.get(id);
  return hit ? { ...hit } : null;
}

export function invalidateBranchBranding(branchId) {
  const id = String(branchId || '').trim();
  if (id) cache.delete(id);
  else cache.clear();
}

export function invalidateAllBranchBrandingExcept(keepBranchId) {
  const keep = String(keepBranchId || '').trim();
  if (!keep) {
    cache.clear();
    return;
  }
  const kept = cache.get(keep);
  cache.clear();
  if (kept) cache.set(keep, kept);
}

export function setBranchBrandingCache(branchId, branding) {
  const id = String(branchId || '').trim();
  if (!id || !branding || typeof branding !== 'object') return;
  cache.set(id, { ...branding, gymCodeId: id });
}

function resolveLocalBranding(branchId, gymCodeById) {
  const id = String(branchId || '').trim();
  const row = typeof gymCodeById?.get === 'function' ? gymCodeById.get(id) : null;
  return resolveClientBranchBranding(row || {});
}

/**
 * Fetch branding for branch (cache-first).
 * @param {string} branchId
 * @param {{ backendJson?: Function, gymCodeById?: Map, dataSyncMode?: string }} opts
 */
export async function resolveBranchBranding(branchId, opts = {}) {
  const id = String(branchId || '').trim();
  if (!id) return defaultClientBranding();

  const cached = peekBranchBranding(id);
  if (cached) return cached;

  const { backendJson, gymCodeById, dataSyncMode } = opts;
  if (dataSyncMode !== 'backend' || typeof backendJson !== 'function') {
    const local = resolveLocalBranding(id, gymCodeById);
    setBranchBrandingCache(id, local);
    return local;
  }

  try {
    const res = await backendJson(`/gym-codes/${encodeURIComponent(id)}/branding`);
    const branding = res?.branding || resolveLocalBranding(id, gymCodeById);
    setBranchBrandingCache(id, branding);
    return branding;
  } catch {
    const fallback = resolveLocalBranding(id, gymCodeById);
    setBranchBrandingCache(id, fallback);
    return fallback;
  }
}

/** Resolve branding for current authoritative active branch. */
export async function resolveBrandingForActiveUser(user, gymCodes, opts = {}) {
  const activeId = getAuthoritativeActiveBranchId(user, gymCodes);
  if (!activeId) return defaultClientBranding();
  return resolveBranchBranding(activeId, opts);
}

export const branchBrandingCache = {
  peek: peekBranchBranding,
  invalidate: invalidateBranchBranding,
  invalidateAllExcept: invalidateAllBranchBrandingExcept,
  set: setBranchBrandingCache,
  resolve: resolveBranchBranding,
  resolveForActiveUser: resolveBrandingForActiveUser,
};
