import { Access } from "../auth/accessControl.js";
import { requireAccess } from "../middleware/permissions.js";
import { getSupabase, gymId } from "../db/supabase/client.js";

const TABLE = "portal_workout_day_exercises";

const LEVELS = new Set(["beginner", "intermediate", "advanced"]);

/** Must match website lib/member-portal/workout-programs.ts dayIds. */
const DAYS = {
  beginner: {
    beginner_d1_full_body_a: {
      label: "Full Body A",
      restDay: false,
      baseKeys: [
        "goblet_squat",
        "machine_chest_press",
        "lat_pulldown",
        "dumbbell_rdl",
        "dumbbell_lateral_raise",
        "plank",
      ],
    },
    beginner_d2_full_body_b: {
      label: "Full Body B",
      restDay: false,
      baseKeys: [
        "leg_press",
        "incline_dumbbell_press",
        "seated_cable_row",
        "leg_curl",
        "dumbbell_curl",
        "dead_bug",
      ],
    },
    beginner_d3_full_body_c: {
      label: "Full Body C",
      restDay: false,
      baseKeys: [
        "split_squat",
        "dumbbell_shoulder_press",
        "assisted_pull_up",
        "hip_thrust",
        "rope_triceps_pushdown",
        "cable_crunch",
      ],
    },
  },
  intermediate: {
    intermediate_d1_chest_triceps: {
      label: "Chest + Triceps",
      restDay: false,
      baseKeys: [
        "barbell_bench_press",
        "incline_dumbbell_press",
        "cable_fly",
        "dips_assisted",
        "rope_triceps_pushdown",
        "overhead_cable_extension",
      ],
    },
    intermediate_d2_back_biceps: {
      label: "Back + Biceps",
      restDay: false,
      baseKeys: [
        "lat_pulldown",
        "barbell_row",
        "seated_cable_row",
        "straight_arm_pulldown",
        "ez_bar_curl",
        "hammer_curl",
      ],
    },
    intermediate_d3_legs: {
      label: "Legs",
      restDay: false,
      baseKeys: [
        "back_squat",
        "romanian_deadlift",
        "leg_press",
        "leg_curl",
        "leg_extension",
        "standing_calf_raise",
      ],
    },
    intermediate_d4_rest: { label: "Rest", restDay: true, baseKeys: [] },
    intermediate_d5_shoulders_abs: {
      label: "Shoulders + Abs",
      restDay: false,
      baseKeys: [
        "overhead_press",
        "dumbbell_lateral_raise",
        "rear_delt_fly",
        "face_pull",
        "cable_crunch",
        "hanging_knee_raise",
      ],
    },
    intermediate_d6_upper: {
      label: "Upper Body",
      restDay: false,
      baseKeys: [
        "incline_bench_press",
        "pull_up_or_lat_pulldown",
        "dumbbell_row",
        "machine_chest_press",
        "cable_curl",
        "rope_triceps_pushdown",
      ],
    },
  },
  advanced: {
    advanced_d1_push: {
      label: "Push",
      restDay: false,
      baseKeys: [
        "barbell_bench_press",
        "incline_dumbbell_press",
        "seated_shoulder_press",
        "cable_fly",
        "dumbbell_lateral_raise",
        "overhead_triceps_extension",
      ],
    },
    advanced_d2_pull: {
      label: "Pull",
      restDay: false,
      baseKeys: [
        "weighted_pull_up",
        "barbell_row",
        "chest_supported_row",
        "lat_pulldown",
        "ez_bar_curl",
        "hammer_curl",
      ],
    },
    advanced_d3_legs: {
      label: "Legs",
      restDay: false,
      baseKeys: [
        "back_squat",
        "romanian_deadlift",
        "hack_squat",
        "leg_curl",
        "leg_extension",
        "standing_calf_raise",
      ],
    },
    advanced_d4_push: {
      label: "Push",
      restDay: false,
      baseKeys: [
        "incline_barbell_press",
        "machine_chest_press",
        "arnold_press",
        "cable_lateral_raise",
        "pec_deck",
        "rope_triceps_pushdown",
      ],
    },
    advanced_d5_pull: {
      label: "Pull",
      restDay: false,
      baseKeys: [
        "deadlift_or_trap_bar",
        "one_arm_dumbbell_row",
        "neutral_grip_pulldown",
        "rear_delt_fly",
        "preacher_curl",
        "cable_curl",
      ],
    },
    advanced_d6_legs_core: {
      label: "Legs + Core",
      restDay: false,
      baseKeys: [
        "front_squat",
        "hip_thrust",
        "bulgarian_split_squat",
        "seated_leg_curl",
        "seated_calf_raise",
        "hanging_leg_raise",
        "cable_crunch",
      ],
    },
  },
};

function parseLevel(value) {
  const level = String(value || "").trim().toLowerCase();
  return LEVELS.has(level) ? level : null;
}

function slugExerciseKey(name) {
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

function rowToApp(row) {
  return {
    id: String(row.id),
    level: String(row.level),
    dayId: String(row.day_id),
    exerciseKey: String(row.exercise_key),
    name: String(row.name || ""),
    muscle: String(row.muscle || ""),
    setsReps: String(row.sets_reps || ""),
    rest: String(row.rest || ""),
    displayOrder: Number(row.display_order) || 100,
    isActive: row.is_active !== false,
  };
}

function isMissingTableError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""}`;
  return /portal_workout_day_exercises/i.test(msg) && /schema cache|does not exist|relation/i.test(msg);
}

export function registerWorkoutPlanDayExerciseRoutes(app) {
  app.get("/api/portal-workout-day-exercises", requireAccess(Access.membersWrite), async (req, res) => {
    try {
      const level = parseLevel(req.query.level) || "beginner";
      const sb = getSupabase();
      const gid = gymId();
      const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("gym_id", gid)
        .eq("level", level)
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) {
        if (isMissingTableError(error)) {
          return res.json({
            ok: true,
            level,
            days: Object.entries(DAYS[level] || {}).map(([dayId, meta]) => ({
              dayId,
              label: meta.label,
              restDay: Boolean(meta.restDay),
              baseExerciseKeys: meta.baseKeys,
              added: [],
            })),
            items: [],
            hint: "Run backend/migrations/supabase_portal_workout_day_exercises.sql",
          });
        }
        return res.status(500).json({ ok: false, error: "load-failed", message: error.message });
      }

      const items = (data || []).map(rowToApp);
      const byDay = new Map();
      for (const item of items) {
        if (!byDay.has(item.dayId)) byDay.set(item.dayId, []);
        byDay.get(item.dayId).push(item);
      }

      const days = Object.entries(DAYS[level] || {}).map(([dayId, meta]) => ({
        dayId,
        label: meta.label,
        restDay: Boolean(meta.restDay),
        baseExerciseKeys: meta.baseKeys,
        added: byDay.get(dayId) || [],
      }));

      return res.json({ ok: true, level, days, items });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: "load-failed",
        message: err instanceof Error ? err.message : "Could not load day exercises",
      });
    }
  });

  app.post("/api/portal-workout-day-exercises", requireAccess(Access.membersWrite), async (req, res) => {
    try {
      const level = parseLevel(req.body?.level);
      const dayId = String(req.body?.dayId || req.body?.day_id || "").trim();
      const name = String(req.body?.name || "").trim().slice(0, 80);
      const muscle = String(req.body?.muscle || "").trim().slice(0, 80);
      const setsReps = String(req.body?.setsReps || req.body?.sets_reps || "3×10–12").trim().slice(0, 40) || "3×10–12";
      const rest = String(req.body?.rest || "60–90s").trim().slice(0, 40) || "60–90s";
      let exerciseKey = String(req.body?.exerciseKey || req.body?.exercise_key || "").trim().toLowerCase();

      if (!level) return res.status(400).json({ ok: false, error: "invalid-level" });
      if (!name) return res.status(400).json({ ok: false, error: "name-required" });

      const dayMeta = DAYS[level]?.[dayId];
      if (!dayMeta) return res.status(400).json({ ok: false, error: "invalid-day" });
      if (dayMeta.restDay) {
        return res.status(400).json({ ok: false, error: "rest-day", message: "Cannot add exercises to a rest day" });
      }

      if (!exerciseKey) exerciseKey = slugExerciseKey(name);
      if (!/^[a-z][a-z0-9_]{1,63}$/.test(exerciseKey)) {
        return res.status(400).json({ ok: false, error: "invalid-exercise-key" });
      }
      if (dayMeta.baseKeys.includes(exerciseKey)) {
        return res.status(409).json({
          ok: false,
          error: "already-in-base",
          message: "That exercise is already in the base day program",
        });
      }

      const sb = getSupabase();
      const gid = gymId();
      const { data: existing } = await sb
        .from(TABLE)
        .select("id, display_order")
        .eq("gym_id", gid)
        .eq("level", level)
        .eq("day_id", dayId)
        .eq("is_active", true)
        .eq("exercise_key", exerciseKey)
        .maybeSingle();
      if (existing?.id) {
        return res.status(409).json({
          ok: false,
          error: "already-added",
          message: "That exercise is already added to this day",
        });
      }

      const { data: maxRow } = await sb
        .from(TABLE)
        .select("display_order")
        .eq("gym_id", gid)
        .eq("level", level)
        .eq("day_id", dayId)
        .eq("is_active", true)
        .order("display_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const displayOrder = Number(req.body?.displayOrder ?? req.body?.display_order);
      const nextOrder = Number.isFinite(displayOrder)
        ? Math.max(0, Math.floor(displayOrder))
        : (Number(maxRow?.display_order) || 100) + 1;

      const insertRow = {
        gym_id: gid,
        level,
        day_id: dayId,
        exercise_key: exerciseKey,
        name,
        muscle,
        sets_reps: setsReps,
        rest,
        display_order: nextOrder,
        is_active: true,
        created_by: String(req.auth?.userId || req.user?.id || "").trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await sb.from(TABLE).insert(insertRow).select("*").single();
      if (error) {
        if (isMissingTableError(error)) {
          return res.status(503).json({
            ok: false,
            error: "table-missing",
            message: "Run backend/migrations/supabase_portal_workout_day_exercises.sql",
          });
        }
        return res.status(500).json({ ok: false, error: "save-failed", message: error.message });
      }

      return res.json({ ok: true, item: rowToApp(data) });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: "save-failed",
        message: err instanceof Error ? err.message : "Could not add exercise",
      });
    }
  });

  app.delete("/api/portal-workout-day-exercises/:id", requireAccess(Access.membersWrite), async (req, res) => {
    try {
      const id = String(req.params.id || "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(id)) {
        return res.status(400).json({ ok: false, error: "invalid-id" });
      }
      const sb = getSupabase();
      const gid = gymId();
      const { data, error } = await sb
        .from(TABLE)
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("gym_id", gid)
        .eq("id", id)
        .eq("is_active", true)
        .select("id")
        .maybeSingle();
      if (error) {
        return res.status(500).json({ ok: false, error: "delete-failed", message: error.message });
      }
      if (!data) return res.status(404).json({ ok: false, error: "not-found" });
      return res.json({ ok: true, id });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: "delete-failed",
        message: err instanceof Error ? err.message : "Could not remove exercise",
      });
    }
  });
}
