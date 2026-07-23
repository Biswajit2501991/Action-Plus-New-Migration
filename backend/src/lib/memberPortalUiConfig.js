/** Defaults for Member Portal Basic workout chips + section visibility. */

export const DEFAULT_BASIC_WORKOUT_OPTIONS = [
  { label: "Back", visible: true },
  { label: "Chest", visible: true },
  { label: "Leg", visible: true },
  { label: "Shoulder", visible: true },
  { label: "Full Body", visible: true },
  { label: "Cardio", visible: true },
  { label: "Biceps", visible: true },
  { label: "Triceps", visible: true },
];

/** Home tiles + Training internals. Missing keys default on (safe for existing rows). */
export const DEFAULT_PORTAL_SECTIONS = {
  // Home tiles (Member Portal home grid)
  homeProfile: true,
  homeQrCard: true,
  homeDevices: true,
  homePayments: true,
  homeAttendance: true,
  homeAlerts: true,
  homeChat: true,
  homeTraining: true,
  homeWeightTracker: true,
  homeBook: true,
  homePerks: true,
  homeBiometric: true,
  // Training internals
  basicDailyWorkouts: true,
  basicNotes: true,
  measurements: true,
  ptSchedule: true,
  ptMemberNotes: true,
  ptAssignment: true,
  ptDiet: false,
  ptWorkoutDetails: false,
};

/**
 * Normalize Basic workout options from settings / request body.
 * Keeps labels unique (case-insensitive); max 40 options.
 */
export function normalizeBasicWorkoutOptions(input) {
  const source = Array.isArray(input) ? input : DEFAULT_BASIC_WORKOUT_OPTIONS;
  const out = [];
  const seen = new Set();
  for (const raw of source) {
    const label = String(
      raw && typeof raw === "object" ? raw.label ?? raw.value ?? "" : raw || "",
    )
      .trim()
      .slice(0, 80);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const visible =
      raw && typeof raw === "object" && "visible" in raw
        ? Boolean(raw.visible)
        : true;
    out.push({ label, visible });
    if (out.length >= 40) break;
  }
  return out.length ? out : DEFAULT_BASIC_WORKOUT_OPTIONS.map((o) => ({ ...o }));
}

/** Merge portal section flags with defaults (unknown keys ignored). */
export function normalizePortalSections(input) {
  const src =
    input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const out = { ...DEFAULT_PORTAL_SECTIONS };
  for (const key of Object.keys(DEFAULT_PORTAL_SECTIONS)) {
    if (key in src) out[key] = Boolean(src[key]);
  }
  return out;
}

/** Visible labels only — what Basic members see as chips. */
export function visibleBasicWorkoutLabels(options) {
  return normalizeBasicWorkoutOptions(options)
    .filter((o) => o.visible)
    .map((o) => o.label);
}
