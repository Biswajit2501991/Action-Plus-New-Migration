/**
 * Branch switch coordinator — single orchestrated flow for tenant context change.
 */

import {
  beginActiveBranchSwitch,
  commitActiveBranchSwitch,
  endActiveBranchSwitch,
  applyAuthoritativeBranchToUser,
} from '../branding/activeBranchStore.js';
import { resolveBranchBranding } from '../branding/branchBrandingCache.js';
import { invalidateCachesForBranchSwitch } from './branchCacheInvalidator.js';

/**
 * @param {object} ctx
 * @param {string} ctx.branchId
 * @param {object} ctx.user
 * @param {object[]} [ctx.gymCodes]
 * @param {Map} [ctx.gymCodeById]
 * @param {string} [ctx.dataSyncMode]
 * @param {Function} [ctx.backendJson]
 * @param {Function} [ctx.writeAuthSession]
 * @param {object} ctx.cacheHandlers - setters for invalidateCachesForBranchSwitch
 * @param {Function} ctx.hydrateFromBackend
 * @param {Function} [ctx.setBranchBranding]
 */
export async function orchestrateBranchSwitch(ctx) {
  const branchId = String(ctx.branchId || '').trim();
  const user = ctx.user;
  if (!branchId || !user?.id) {
    throw new Error('branch-switch-invalid');
  }

  beginActiveBranchSwitch(user.id, branchId);

  // Persist current-branch visitors while JWT still matches the outgoing branch.
  if (typeof ctx.syncVisitorsBeforeSwitch === 'function') {
    await ctx.syncVisitorsBeforeSwitch();
  }

  invalidateCachesForBranchSwitch(ctx.cacheHandlers || {}, branchId);

  let nextUser = applyAuthoritativeBranchToUser({
    ...user,
    gymCodeId: branchId,
    activeBranchId: branchId,
  }, ctx.gymCodes || []);

  try {
    if (ctx.dataSyncMode === 'backend' && typeof ctx.backendJson === 'function') {
      const out = await ctx.backendJson('/auth/active-branch', {
        method: 'PATCH',
        body: JSON.stringify({ gymCodeId: branchId }),
      });
      if (out?.token && typeof ctx.writeAuthSession === 'function') {
        ctx.writeAuthSession(user.id, out.token);
      }
      const nextAllowed = Array.isArray(out?.allowedBranchIds) ? out.allowedBranchIds : user.allowedBranchIds;
      const nextAssigned = Array.isArray(out?.assignedBranchIds) ? out.assignedBranchIds : nextAllowed;
      commitActiveBranchSwitch({
        userId: user.id,
        branchId,
        allowedBranchIds: nextAllowed,
        assignedBranchIds: nextAssigned,
      });
      nextUser = applyAuthoritativeBranchToUser({
        ...user,
        gymCodeId: branchId,
        activeBranchId: branchId,
        allowedBranchIds: nextAllowed,
        assignedBranchIds: nextAssigned,
      }, ctx.gymCodes || []);
    } else {
      commitActiveBranchSwitch({ userId: user.id, branchId });
    }

    const branding = await resolveBranchBranding(branchId, {
      backendJson: ctx.backendJson,
      gymCodeById: ctx.gymCodeById,
      dataSyncMode: ctx.dataSyncMode,
    });
    if (typeof ctx.setBranchBranding === 'function') ctx.setBranchBranding(branding);

    if (typeof ctx.hydrateFromBackend === 'function') {
      await ctx.hydrateFromBackend({
        replaceBranchData: true,
        branchContextReplace: true,
        authUser: nextUser,
        skipAuthBranchOverwrite: true,
      });
    }

    return { nextUser, branding };
  } finally {
    endActiveBranchSwitch();
  }
}
