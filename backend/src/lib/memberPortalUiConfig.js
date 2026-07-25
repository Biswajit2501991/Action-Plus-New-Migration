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

/** Sentinel labels stored inside basic_workout_options so home-tile toggles
 *  survive older API builds that strip unknown portal_sections keys. */
export const HOME_TILE_OPTION_PREFIX = "__tile__:";

export const HOME_TILE_KEYS = [
  "homeProfile",
  "homeQrCard",
  "homeDevices",
  "homePayments",
  "homeAttendance",
  "homeAlerts",
  "homeChat",
  "homeTraining",
  "homeWeightTracker",
  "homeBook",
  "homePerks",
  "homeBiometric",
];

export function isHomeTileOptionLabel(label) {
  return String(label || "").startsWith(HOME_TILE_OPTION_PREFIX);
}

export function homeTileOptionLabel(key) {
  return `${HOME_TILE_OPTION_PREFIX}${key}`;
}

/** Split workout chips from __tile__: sentinels used to persist home visibility. */
export function splitWorkoutOptionsAndHomeTiles(input) {
  const normalized = normalizeBasicWorkoutOptions(input);
  const workoutOptions = [];
  const homeFromOptions = {};
  for (const row of normalized) {
    if (isHomeTileOptionLabel(row.label)) {
      const key = row.label.slice(HOME_TILE_OPTION_PREFIX.length);
      if (HOME_TILE_KEYS.includes(key)) homeFromOptions[key] = row.visible;
      continue;
    }
    workoutOptions.push(row);
  }
  return { workoutOptions, homeFromOptions };
}

/** Persist home-tile booleans as sentinel options alongside real workout chips. */
export function encodeHomeTilesIntoWorkoutOptions(workoutOptions, sections) {
  const { workoutOptions: clean } = splitWorkoutOptionsAndHomeTiles(workoutOptions);
  const src =
    sections && typeof sections === "object" && !Array.isArray(sections)
      ? sections
      : DEFAULT_PORTAL_SECTIONS;
  const tiles = HOME_TILE_KEYS.map((key) => ({
    label: homeTileOptionLabel(key),
    visible: key in src ? Boolean(src[key]) : true,
  }));
  return [...clean, ...tiles];
}

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
    if (out.length >= 60) break;
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

/**
 * Apply saved/partial sections onto a fallback (e.g. what the client just sent).
 * Keys missing from `saved` keep the fallback value — prevents old API responses
 * from resetting newer home-tile flags back to defaults.
 */
export function mergePortalSections(saved, fallback) {
  const base = normalizePortalSections(
    fallback && typeof fallback === "object" ? fallback : DEFAULT_PORTAL_SECTIONS,
  );
  const src =
    saved && typeof saved === "object" && !Array.isArray(saved) ? saved : null;
  if (!src) return base;
  for (const key of Object.keys(DEFAULT_PORTAL_SECTIONS)) {
    if (key in src) base[key] = Boolean(src[key]);
  }
  return base;
}

/** Visible labels only — what Basic members see as chips. */
export function visibleBasicWorkoutLabels(options) {
  return normalizeBasicWorkoutOptions(options)
    .filter((o) => o.visible)
    .filter((o) => !isHomeTileOptionLabel(o.label))
    .map((o) => o.label);
}
