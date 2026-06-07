/** Sync draft fields from a PT profile when the selected client changes. */
export function ptWorkoutNotesDraftFromProfile(profile) {
  return String(profile?.ptWorkoutNotes || '');
}

export function ptWorkoutPlanDraftFromProfile(profile) {
  return String(profile?.workoutPlan || '');
}

export function ptDietDraftFromProfile(profile) {
  return {
    calories: String(profile?.calories || ''),
    protein: String(profile?.protein || ''),
    water: String(profile?.water || ''),
    dietPlan: String(profile?.dietPlan || ''),
  };
}

export function ptDietDraftDirty(draft, profile) {
  const base = ptDietDraftFromProfile(profile);
  return draft.calories !== base.calories
    || draft.protein !== base.protein
    || draft.water !== base.water
    || draft.dietPlan !== base.dietPlan;
}

/** Build next profile object for PATCH (does not mutate inputs). */
export function buildPtProfilePatch(prevProfile, patch, actor = '') {
  const prev = prevProfile && typeof prevProfile === 'object' ? prevProfile : {};
  const next = patch && typeof patch === 'object' ? patch : {};
  return {
    ...prev,
    ...next,
    updatedAt: new Date().toISOString(),
    updatedBy: actor || prev.updatedBy || '',
  };
}
