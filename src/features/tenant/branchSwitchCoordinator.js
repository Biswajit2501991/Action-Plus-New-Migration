/**
 * Branch switch = tenant context change (not a client-side filter).
 * Helpers coordinate cache purge and replace-mode hydration.
 */

export function shouldReplaceBranchDataOnHydrate(opts = {}) {
  return opts.replaceBranchData === true || opts.branchContextReplace === true;
}

/** Filter members/visitors to active branch only (defense in depth before merge). */
export function filterRowsToActiveBranch(rows, activeBranchId) {
  const active = String(activeBranchId || '').trim();
  if (!active) return [];
  const list = Array.isArray(rows) ? rows : [];
  return list.filter((r) => String(r?.assignedGymCodeId || '').trim() === active);
}

/**
 * After branch switch: use server list as source of truth; keep only same-branch optimistic locals.
 */
export function mergeMembersAfterBranchReplace(localMembers, remoteMembers, activeBranchId) {
  const active = String(activeBranchId || '').trim();
  const remotes = filterRowsToActiveBranch(remoteMembers, active);
  const locals = filterRowsToActiveBranch(localMembers, active);
  if (!locals.length) return remotes;
  const remoteById = new Map(remotes.map((m) => [String(m?.memberId || ''), m]));
  const out = [...remotes];
  for (const localRow of locals) {
    const id = String(localRow?.memberId || '');
    if (!id || remoteById.has(id)) continue;
    out.push(localRow);
  }
  return out;
}

export function mergeVisitorsAfterBranchReplace(localVisitors, remoteVisitors, activeBranchId) {
  const active = String(activeBranchId || '').trim();
  const remotes = filterRowsToActiveBranch(remoteVisitors, active);
  const locals = filterRowsToActiveBranch(localVisitors, active);
  if (!locals.length) return remotes;
  const remoteById = new Map(remotes.map((v) => [String(v?.id || v?.visitorId || ''), v]));
  const out = [...remotes];
  for (const localRow of locals) {
    const id = String(localRow?.id || localRow?.visitorId || '');
    if (!id || remoteById.has(id)) continue;
    out.push(localRow);
  }
  return out;
}
