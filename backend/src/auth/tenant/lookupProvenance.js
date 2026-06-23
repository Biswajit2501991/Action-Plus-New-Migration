import { LOOKUP_CREATED_BY } from './roles.js';
import {
  authIsBranchOwner,
  authIsMasterOwner,
  resolveActiveBranchId,
} from './scopedAuth.js';

/**
 * Option 2 lookup write provenance — every row owned by a gym_codes.id branch.
 * Master without active branch: caller must resolve HQ gym_code_id before insert.
 */
export function resolveLookupProvenanceForAuth(auth) {
  const activeBranch = resolveActiveBranchId(auth);
  const isMaster = authIsMasterOwner(auth);
  const isBranchOwner = authIsBranchOwner(auth);

  if (activeBranch) {
    if (isMaster || isBranchOwner) {
      return {
        createdByRole: LOOKUP_CREATED_BY.BRANCH_OWNER,
        createdByGymCodeId: activeBranch,
      };
    }
    return {
      createdByRole: LOOKUP_CREATED_BY.STAFF,
      createdByGymCodeId: activeBranch,
    };
  }

  const homeBranch = String(auth?.gymCodeId || auth?.gym_code_id || '').trim();
  if (isBranchOwner && homeBranch) {
    return {
      createdByRole: LOOKUP_CREATED_BY.BRANCH_OWNER,
      createdByGymCodeId: homeBranch,
    };
  }
  if (!isMaster && homeBranch) {
    return {
      createdByRole: LOOKUP_CREATED_BY.STAFF,
      createdByGymCodeId: homeBranch,
    };
  }

  return {
    createdByRole: isMaster ? LOOKUP_CREATED_BY.BRANCH_OWNER : LOOKUP_CREATED_BY.STAFF,
    createdByGymCodeId: null,
  };
}

/** Requester identity for lookup delete guards. */
export function resolveLookupDeleteRequesterForAuth(auth) {
  const provenance = resolveLookupProvenanceForAuth(auth);
  const activeBranch = resolveActiveBranchId(auth);
  const branch = activeBranch || provenance.createdByGymCodeId || null;
  return {
    requesterRole: authIsMasterOwner(auth) ? LOOKUP_CREATED_BY.MASTER_OWNER : provenance.createdByRole,
    requesterGymCodeId: branch,
  };
}
