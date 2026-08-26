/** Built-in Workout Plan days (must match website workout-programs.ts). Rest days omitted for add-exercise UI. */

export type WorkoutPlanLevel = "beginner" | "intermediate" | "advanced";

export type WorkoutPlanDayMeta = {
  dayId: string;
  dayNumber: number;
  label: string;
  restDay?: boolean;
  baseExerciseKeys: string[];
};

export const WORKOUT_PLAN_DAYS: Record<WorkoutPlanLevel, WorkoutPlanDayMeta[]> = {
  beginner: [
    {
      dayId: "beginner_d1_full_body_a",
      dayNumber: 1,
      label: "Full Body A",
      baseExerciseKeys: [
        "goblet_squat",
        "machine_chest_press",
        "lat_pulldown",
        "dumbbell_rdl",
        "dumbbell_lateral_raise",
        "plank",
      ],
    },
    {
      dayId: "beginner_d2_full_body_b",
      dayNumber: 2,
      label: "Full Body B",
      baseExerciseKeys: [
        "leg_press",
        "incline_dumbbell_press",
        "seated_cable_row",
        "leg_curl",
        "dumbbell_curl",
        "dead_bug",
      ],
    },
    {
      dayId: "beginner_d3_full_body_c",
      dayNumber: 3,
      label: "Full Body C",
      baseExerciseKeys: [
        "split_squat",
        "dumbbell_shoulder_press",
        "assisted_pull_up",
        "hip_thrust",
        "rope_triceps_pushdown",
        "cable_crunch",
      ],
    },
  ],
  intermediate: [
    {
      dayId: "intermediate_d1_chest_triceps",
      dayNumber: 1,
      label: "Chest + Triceps",
      baseExerciseKeys: [
        "barbell_bench_press",
        "incline_dumbbell_press",
        "cable_fly",
        "dips_assisted",
        "rope_triceps_pushdown",
        "overhead_cable_extension",
      ],
    },
    {
      dayId: "intermediate_d2_back_biceps",
      dayNumber: 2,
      label: "Back + Biceps",
      baseExerciseKeys: [
        "lat_pulldown",
        "barbell_row",
        "seated_cable_row",
        "straight_arm_pulldown",
        "ez_bar_curl",
        "hammer_curl",
      ],
    },
    {
      dayId: "intermediate_d3_legs",
      dayNumber: 3,
      label: "Legs",
      baseExerciseKeys: [
        "back_squat",
        "romanian_deadlift",
        "leg_press",
        "leg_curl",
        "leg_extension",
        "standing_calf_raise",
      ],
    },
    {
      dayId: "intermediate_d4_rest",
      dayNumber: 4,
      label: "Rest",
      restDay: true,
      baseExerciseKeys: [],
    },
    {
      dayId: "intermediate_d5_shoulders_abs",
      dayNumber: 5,
      label: "Shoulders + Abs",
      baseExerciseKeys: [
        "overhead_press",
        "dumbbell_lateral_raise",
        "rear_delt_fly",
        "face_pull",
        "cable_crunch",
        "hanging_knee_raise",
      ],
    },
    {
      dayId: "intermediate_d6_upper",
      dayNumber: 6,
      label: "Upper Body",
      baseExerciseKeys: [
        "incline_bench_press",
        "pull_up_or_lat_pulldown",
        "dumbbell_row",
        "machine_chest_press",
        "cable_curl",
        "rope_triceps_pushdown",
      ],
    },
  ],
  advanced: [
    {
      dayId: "advanced_d1_push",
      dayNumber: 1,
      label: "Push",
      baseExerciseKeys: [
        "barbell_bench_press",
        "incline_dumbbell_press",
        "seated_shoulder_press",
        "cable_fly",
        "dumbbell_lateral_raise",
        "overhead_triceps_extension",
      ],
    },
    {
      dayId: "advanced_d2_pull",
      dayNumber: 2,
      label: "Pull",
      baseExerciseKeys: [
        "weighted_pull_up",
        "barbell_row",
        "chest_supported_row",
        "lat_pulldown",
        "ez_bar_curl",
        "hammer_curl",
      ],
    },
    {
      dayId: "advanced_d3_legs",
      dayNumber: 3,
      label: "Legs",
      baseExerciseKeys: [
        "back_squat",
        "romanian_deadlift",
        "hack_squat",
        "leg_curl",
        "leg_extension",
        "standing_calf_raise",
      ],
    },
    {
      dayId: "advanced_d4_push",
      dayNumber: 4,
      label: "Push",
      baseExerciseKeys: [
        "incline_barbell_press",
        "machine_chest_press",
        "arnold_press",
        "cable_lateral_raise",
        "pec_deck",
        "rope_triceps_pushdown",
      ],
    },
    {
      dayId: "advanced_d5_pull",
      dayNumber: 5,
      label: "Pull",
      baseExerciseKeys: [
        "deadlift_or_trap_bar",
        "one_arm_dumbbell_row",
        "neutral_grip_pulldown",
        "rear_delt_fly",
        "preacher_curl",
        "cable_curl",
      ],
    },
    {
      dayId: "advanced_d6_legs_core",
      dayNumber: 6,
      label: "Legs + Core",
      baseExerciseKeys: [
        "front_squat",
        "hip_thrust",
        "bulgarian_split_squat",
        "seated_leg_curl",
        "seated_calf_raise",
        "hanging_leg_raise",
        "cable_crunch",
      ],
    },
  ],
};

export function workoutPlanDayMeta(level: WorkoutPlanLevel, dayId: string) {
  return WORKOUT_PLAN_DAYS[level]?.find((d) => d.dayId === dayId) || null;
}

export function slugExerciseKey(name: string) {
  let base = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  if (!base) base = "custom_exercise";
  if (!/^[a-z]/.test(base)) base = `ex_${base}`;
  return base.slice(0, 64);
}
