/** Shared Member Portal UI config helpers (Settings + Next API route). */

export type BasicWorkoutOption = { label: string; visible: boolean };

export type PortalSections = {
  homeProfile: boolean;
  homeQrCard: boolean;
  homeDevices: boolean;
  homePayments: boolean;
  homeAttendance: boolean;
  homeAlerts: boolean;
  homeChat: boolean;
  homeTraining: boolean;
  homeWeightTracker: boolean;
  homeBook: boolean;
  homePerks: boolean;
  homeBiometric: boolean;
  basicDailyWorkouts: boolean;
  basicNotes: boolean;
  measurements: boolean;
  ptSchedule: boolean;
  ptMemberNotes: boolean;
  ptAssignment: boolean;
  ptDiet: boolean;
  ptWorkoutDetails: boolean;
};

export const DEFAULT_BASIC_WORKOUT_OPTIONS: BasicWorkoutOption[] = [
  { label: "Back", visible: true },
  { label: "Chest", visible: true },
  { label: "Leg", visible: true },
  { label: "Shoulder", visible: true },
  { label: "Full Body", visible: true },
  { label: "Cardio", visible: true },
  { label: "Biceps", visible: true },
  { label: "Triceps", visible: true },
];

export const DEFAULT_PORTAL_SECTIONS: PortalSections = {
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
  basicDailyWorkouts: true,
  basicNotes: true,
  measurements: true,
  ptSchedule: true,
  ptMemberNotes: true,
  ptAssignment: true,
  ptDiet: false,
  ptWorkoutDetails: false,
};

export const HOME_TILE_OPTION_PREFIX = "__tile__:";

export const HOME_TILE_KEYS: (keyof PortalSections)[] = [
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

export function normalizeBasicWorkoutOptions(input: unknown): BasicWorkoutOption[] {
  const source = Array.isArray(input) ? input : DEFAULT_BASIC_WORKOUT_OPTIONS;
  const out: BasicWorkoutOption[] = [];
  const seen = new Set<string>();
  for (const raw of source) {
    const label = String(
      raw && typeof raw === "object"
        ? (raw as { label?: string; value?: string }).label ??
            (raw as { value?: string }).value ??
            ""
        : raw || "",
    )
      .trim()
      .slice(0, 80);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const visible =
      raw && typeof raw === "object" && "visible" in (raw as object)
        ? Boolean((raw as { visible?: boolean }).visible)
        : true;
    out.push({ label, visible });
    if (out.length >= 60) break;
  }
  return out.length ? out : DEFAULT_BASIC_WORKOUT_OPTIONS.map((o) => ({ ...o }));
}

export function normalizePortalSections(input: unknown): PortalSections {
  const src =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const out = { ...DEFAULT_PORTAL_SECTIONS };
  for (const key of Object.keys(DEFAULT_PORTAL_SECTIONS) as (keyof PortalSections)[]) {
    if (key in src) out[key] = Boolean(src[key]);
  }
  return out;
}

export function mergePortalSections(
  saved: unknown,
  fallback: PortalSections,
): PortalSections {
  const base = normalizePortalSections(fallback);
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return base;
  const src = saved as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_PORTAL_SECTIONS) as (keyof PortalSections)[]) {
    if (key in src) base[key] = Boolean(src[key]);
  }
  return base;
}

export function isHomeTileOptionLabel(label: string) {
  return label.startsWith(HOME_TILE_OPTION_PREFIX);
}

export function splitWorkoutOptionsAndHomeTiles(input: unknown): {
  workoutOptions: BasicWorkoutOption[];
  homeFromOptions: Partial<PortalSections>;
} {
  const normalized = normalizeBasicWorkoutOptions(input);
  const workoutOptions: BasicWorkoutOption[] = [];
  const homeFromOptions: Partial<PortalSections> = {};
  for (const row of normalized) {
    if (isHomeTileOptionLabel(row.label)) {
      const key = row.label.slice(HOME_TILE_OPTION_PREFIX.length) as keyof PortalSections;
      if (HOME_TILE_KEYS.includes(key)) homeFromOptions[key] = row.visible;
      continue;
    }
    workoutOptions.push(row);
  }
  return { workoutOptions, homeFromOptions };
}

export function encodeHomeTilesIntoWorkoutOptions(
  workoutOptions: BasicWorkoutOption[],
  sections: PortalSections,
): BasicWorkoutOption[] {
  const { workoutOptions: clean } = splitWorkoutOptionsAndHomeTiles(workoutOptions);
  const tiles = HOME_TILE_KEYS.map((key) => ({
    label: `${HOME_TILE_OPTION_PREFIX}${key}`,
    visible: Boolean(sections[key]),
  }));
  return [...clean, ...tiles];
}

export function homeTilesBitToken(sections: PortalSections): string {
  const bits = HOME_TILE_KEYS.map((k) => (sections[k] ? "1" : "0")).join("");
  return `__pht__:v1:${bits}`;
}

export function homeTilesFromExerciseTypeMarkers(
  exerciseTypes: unknown,
): Partial<PortalSections> {
  const list = Array.isArray(exerciseTypes) ? exerciseTypes.map(String) : [];
  const token = list.find((v) => v.startsWith("__pht__:v1:"));
  if (!token) return {};
  const bits = token.slice("__pht__:v1:".length);
  const out: Partial<PortalSections> = {};
  HOME_TILE_KEYS.forEach((key, i) => {
    if (bits[i] === "0") out[key] = false;
    else if (bits[i] === "1") out[key] = true;
  });
  return out;
}

export function isPortalMarkerLabel(label: string) {
  const s = String(label || "");
  return s.startsWith(HOME_TILE_OPTION_PREFIX) || s.startsWith("__pht__:");
}

export function hydratePortalSettingsFromApi(settings?: {
  basic_workout_options?: BasicWorkoutOption[];
  portal_sections?: PortalSections;
  exerciseTypes?: unknown;
}): { workoutOptions: BasicWorkoutOption[]; portalSections: PortalSections } {
  const split = splitWorkoutOptionsAndHomeTiles(settings?.basic_workout_options);
  const fromMarkers = homeTilesFromExerciseTypeMarkers(settings?.exerciseTypes);
  const portalSections = mergePortalSections(
    settings?.portal_sections,
    mergePortalSections(
      split.homeFromOptions,
      mergePortalSections(fromMarkers, DEFAULT_PORTAL_SECTIONS),
    ),
  );
  return { workoutOptions: split.workoutOptions, portalSections };
}
