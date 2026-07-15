/**
 * Shared PT trainer assignment matching (Node + mirror of frontend helper).
 *
 * Gym convention: plan names like PT-Raja / PT-Bis encode the trainer.
 * members.assigned_staff is usually sales enrollment staff — not used when a
 * PT-* plan suffix is present.
 */

export function resolveStaffCanonical(value, aliasMap = null) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (aliasMap && typeof aliasMap.get === 'function' && aliasMap.has(raw)) {
    return aliasMap.get(raw) || raw;
  }
  return raw;
}

/**
 * Match assignment token to viewer keys (exact, alias, or short prefix like Bis→Biswajit).
 */
export function staffTokenMatchesViewer(token, viewerKeys) {
  const t = String(token || '').trim().toLowerCase();
  if (!t || !viewerKeys?.size) return false;
  if (viewerKeys.has(t)) return true;
  for (const vk of viewerKeys) {
    const v = String(vk || '').trim().toLowerCase();
    if (!v) continue;
    if (t.length >= 3 && v.length >= 3 && (v.startsWith(t) || t.startsWith(v))) return true;
  }
  return false;
}

export function ptAssignmentTokens(member, profile) {
  const tokens = [];
  const push = (v) => {
    const s = String(v || '').trim();
    if (s) tokens.push(s);
  };
  push(profile?.trainerId);
  push(profile?.trainer);

  const plan = String(member?.plan || member?.plan_name || '').trim();
  const suffix = plan.match(/\bpt[-_\s]+(.+)$/i)?.[1]?.trim();
  if (suffix) {
    // PT-Raja / PT-Bis → trainer is the plan suffix (not sales assigned_staff).
    push(suffix);
  } else {
    // Generic PT plan — fall back to enrollment / trainer fields.
    push(member?.staff);
    push(member?.assigned_staff);
    push(member?.trainerId);
  }

  return tokens;
}

export function ptClientAssignedToViewer(member, profile, viewerId, viewerName, aliasMap = null) {
  const viewerKeys = new Set(
    [
      resolveStaffCanonical(viewerId, aliasMap),
      resolveStaffCanonical(viewerName, aliasMap),
    ].filter(Boolean),
  );
  if (!viewerKeys.size) return false;

  const assigned = ptAssignmentTokens(member, profile)
    .map((t) => resolveStaffCanonical(t, aliasMap))
    .filter(Boolean);
  if (!assigned.length) return false;

  return assigned.some((token) => staffTokenMatchesViewer(token, viewerKeys));
}

/**
 * Filter PT profiles for non-admin staff to only their assigned clients.
 * Branch admins / global already handled by caller (pass through).
 *
 * @param {Record<string, object>} profiles
 * @param {object} auth
 * @param {Map<string, string>} memberBranchByCode
 * @param {{ aliasMap?: Map<string, string>, memberStaffByCode?: Map<string, string>, memberPlanByCode?: Map<string, string>, isAdmin?: boolean }} [opts]
 */
export function filterPtClientProfilesForTrainerScope(profiles, auth, memberBranchByCode, opts = {}) {
  if (!profiles || typeof profiles !== 'object') return {};
  if (!auth) return {};
  if (opts.isAdmin) return profiles;

  const aliasMap = opts.aliasMap || null;
  const memberStaffByCode = opts.memberStaffByCode || null;
  const memberPlanByCode = opts.memberPlanByCode || null;
  const caller = String(auth.userId || '').trim();
  const out = {};

  for (const [memberCode, plan] of Object.entries(profiles)) {
    const code = String(memberCode || '').trim();
    const profile = plan && typeof plan === 'object' ? plan : {};
    const member = {
      staff: memberStaffByCode?.get(code) || '',
      plan: memberPlanByCode?.get(code) || '',
    };
    if (ptClientAssignedToViewer(member, profile, caller, null, aliasMap)) {
      out[memberCode] = plan;
    }
  }
  return out;
}
