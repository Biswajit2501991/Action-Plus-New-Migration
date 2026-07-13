import type { PtClientProfile, PtDietDraft } from "@/types/pt";

export function ptWorkoutNotesDraftFromProfile(profile?: PtClientProfile | null) {
  return String(profile?.ptWorkoutNotes || "");
}

export function ptWorkoutPlanDraftFromProfile(profile?: PtClientProfile | null) {
  return String(profile?.workoutPlan || "");
}

export function ptDietDraftFromProfile(profile?: PtClientProfile | null): PtDietDraft {
  return {
    calories: String(profile?.calories || ""),
    protein: String(profile?.protein || ""),
    water: String(profile?.water || ""),
    dietPlan: String(profile?.dietPlan || ""),
  };
}

export function ptDietDraftDirty(draft: PtDietDraft, profile?: PtClientProfile | null) {
  const base = ptDietDraftFromProfile(profile);
  return (
    draft.calories !== base.calories ||
    draft.protein !== base.protein ||
    draft.water !== base.water ||
    draft.dietPlan !== base.dietPlan
  );
}

/** Build next profile object for PATCH (does not mutate inputs). */
export function buildPtProfilePatch(
  prevProfile: PtClientProfile | null | undefined,
  patch: Partial<PtClientProfile>,
  actor = "",
): PtClientProfile {
  const prev = prevProfile && typeof prevProfile === "object" ? prevProfile : {};
  const next = patch && typeof patch === "object" ? patch : {};
  return {
    ...prev,
    ...next,
    updatedAt: new Date().toISOString(),
    updatedBy: actor || prev.updatedBy || "",
  };
}
