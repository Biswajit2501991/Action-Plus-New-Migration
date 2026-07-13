export const DEFAULT_EXERCISE_TYPES = [
  "Back",
  "Back + Biceps",
  "Chest",
  "Chest + Triceps",
  "Legs",
  "Cardio + Back",
  "Chest + Cardio",
  "Chest + Back + Triceps",
  "Freehand + Cardio",
  "Yoga + Cardio",
  "Yoga",
  "Running",
  "Running + Cycling",
  "Rest day",
  "Shoulder",
  "Shoulder + Biceps",
  "Shoulder + Legs",
  "Biceps+Triceps+Forearms",
] as const;

export const PT_TABS = [
  "PT Workout",
  "Workout Plan",
  "Diet Plan",
  "Chat Trainer",
  "Today Sessions",
  "Weight Progress",
] as const;

export type PtTab = (typeof PT_TABS)[number];
