import { Access } from "../auth/accessControl.js";
import { requireAccess } from "../middleware/permissions.js";
import { getSupabase, gymId } from "../db/supabase/client.js";
import { env } from "../config/env.js";

const MEDIA_TABLE = "portal_workout_exercise_media";
const MEDIA_BUCKET = "website-media";
const MAX_BYTES = 50 * 1024 * 1024;

const CATALOG = [
  { key: "arnold_press", name: "Arnold Press" },
  { key: "assisted_pull_up", name: "Assisted Pull-Up" },
  { key: "back_squat", name: "Back Squat" },
  { key: "barbell_bench_press", name: "Barbell Bench Press" },
  { key: "barbell_row", name: "Barbell Row" },
  { key: "bulgarian_split_squat", name: "Bulgarian Split Squat" },
  { key: "cable_crunch", name: "Cable Crunch" },
  { key: "cable_curl", name: "Cable Curl" },
  { key: "cable_fly", name: "Cable Fly" },
  { key: "cable_lateral_raise", name: "Cable Lateral Raise" },
  { key: "chest_supported_row", name: "Chest-Supported Row" },
  { key: "dead_bug", name: "Dead Bug" },
  { key: "deadlift_or_trap_bar", name: "Deadlift/Trap-Bar Deadlift" },
  { key: "dips_assisted", name: "Dips/Assisted Dips" },
  { key: "dumbbell_curl", name: "Dumbbell Curl" },
  { key: "dumbbell_lateral_raise", name: "Dumbbell Lateral Raise" },
  { key: "dumbbell_rdl", name: "Dumbbell Romanian Deadlift" },
  { key: "dumbbell_row", name: "Dumbbell Row" },
  { key: "dumbbell_shoulder_press", name: "Dumbbell Shoulder Press" },
  { key: "ez_bar_curl", name: "EZ-Bar Curl" },
  { key: "face_pull", name: "Face Pull" },
  { key: "front_squat", name: "Front Squat" },
  { key: "goblet_squat", name: "Goblet Squat" },
  { key: "hack_squat", name: "Hack Squat" },
  { key: "hammer_curl", name: "Hammer Curl" },
  { key: "hanging_knee_raise", name: "Hanging Knee Raise" },
  { key: "hanging_leg_raise", name: "Hanging Leg Raise" },
  { key: "hip_thrust", name: "Hip Thrust" },
  { key: "incline_barbell_press", name: "Incline Barbell Press" },
  { key: "incline_bench_press", name: "Incline Bench Press" },
  { key: "incline_dumbbell_press", name: "Incline Dumbbell Press" },
  { key: "lat_pulldown", name: "Lat Pulldown" },
  { key: "leg_curl", name: "Leg Curl" },
  { key: "leg_extension", name: "Leg Extension" },
  { key: "leg_press", name: "Leg Press" },
  { key: "machine_chest_press", name: "Machine Chest Press" },
  { key: "neutral_grip_pulldown", name: "Neutral-Grip Pulldown" },
  { key: "one_arm_dumbbell_row", name: "One-Arm Dumbbell Row" },
  { key: "overhead_cable_extension", name: "Overhead Cable Extension" },
  { key: "overhead_press", name: "Overhead Press" },
  { key: "overhead_triceps_extension", name: "Overhead Triceps Extension" },
  { key: "pec_deck", name: "Pec Deck" },
  { key: "plank", name: "Plank" },
  { key: "preacher_curl", name: "Preacher Curl" },
  { key: "pull_up_or_lat_pulldown", name: "Pull-Up/Lat Pulldown" },
  { key: "rear_delt_fly", name: "Rear Delt Fly" },
  { key: "romanian_deadlift", name: "Romanian Deadlift" },
  { key: "rope_triceps_pushdown", name: "Rope Triceps Pushdown" },
  { key: "seated_cable_row", name: "Seated Cable Row" },
  { key: "seated_calf_raise", name: "Seated Calf Raise" },
  { key: "seated_leg_curl", name: "Seated Leg Curl" },
  { key: "seated_shoulder_press", name: "Seated Shoulder Press" },
  { key: "split_squat", name: "Split Squat" },
  { key: "standing_calf_raise", name: "Standing Calf Raise" },
  { key: "straight_arm_pulldown", name: "Straight-Arm Pulldown" },
  { key: "weighted_pull_up", name: "Weighted Pull-Up" },
];

const KEYS = new Set(CATALOG.map((row) => row.key));

function publicUrl(storagePath) {
  const base = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${MEDIA_BUCKET}/${storagePath}`;
}

function catalogRow(exerciseKey) {
  return CATALOG.find((row) => row.key === exerciseKey) || null;
}

export function registerWorkoutPlanExerciseMediaRoutes(app) {
  app.get("/api/portal-workout-exercise-media", requireAccess(Access.membersWrite), async (_req, res) => {
    try {
      const sb = getSupabase();
      const gid = gymId();
      const { data, error } = await sb
        .from(MEDIA_TABLE)
        .select("exercise_key, display_name, mp4_url, storage_path, youtube_url")
        .eq("gym_id", gid);
      if (error) {
        return res.status(500).json({ ok: false, error: "load-failed", message: error.message });
      }
      const byKey = new Map((data || []).map((row) => [String(row.exercise_key || ""), row]));
      const exercises = CATALOG.map((ex) => {
        const row = byKey.get(ex.key);
        const mp4Url = String(row?.mp4_url || "").trim() || null;
        return {
          exerciseKey: ex.key,
          name: ex.name,
          mp4Url,
          hasVideo: Boolean(mp4Url),
        };
      });
      return res.json({ ok: true, exercises, maxBytes: MAX_BYTES });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: "load-failed",
        message: err instanceof Error ? err.message : "load-failed",
      });
    }
  });

  app.post("/api/portal-workout-exercise-media", requireAccess(Access.membersWrite), async (req, res) => {
    try {
      const action = String(req.body?.action || "").trim();
      const exerciseKey = String(req.body?.exerciseKey || "").trim();
      const catalog = catalogRow(exerciseKey);
      if (!catalog || !KEYS.has(exerciseKey)) {
        return res.status(400).json({ ok: false, error: "unknown-exercise" });
      }
      const sb = getSupabase();
      const gid = gymId();

      if (action === "sign") {
        const fileSize = Number(req.body?.fileSize || 0);
        if (fileSize > MAX_BYTES) {
          return res.status(400).json({ ok: false, error: "too-large", message: "Video must be 50 MB or smaller." });
        }
        const storagePath = `workout-plan/${gid}/${exerciseKey}-${Date.now()}.mp4`;
        const { data, error } = await sb.storage
          .from(MEDIA_BUCKET)
          .createSignedUploadUrl(storagePath, { upsert: true });
        if (error || !data?.signedUrl) {
          return res.status(500).json({
            ok: false,
            error: "sign-failed",
            message: error?.message || "Could not create upload URL",
          });
        }
        return res.json({
          ok: true,
          action: "sign",
          exerciseKey,
          storagePath,
          uploadUrl: data.signedUrl,
          token: data.token || "",
        });
      }

      if (action === "commit") {
        const storagePath = String(req.body?.storagePath || "").trim();
        const expectedPrefix = `workout-plan/${gid}/${exerciseKey}-`;
        if (!storagePath.startsWith(expectedPrefix) || !storagePath.endsWith(".mp4")) {
          return res.status(400).json({ ok: false, error: "invalid-path" });
        }
        const mp4Url = publicUrl(storagePath);
        const { data: existing } = await sb
          .from(MEDIA_TABLE)
          .select("storage_path, youtube_url")
          .eq("gym_id", gid)
          .eq("exercise_key", exerciseKey)
          .maybeSingle();
        const { error } = await sb.from(MEDIA_TABLE).upsert(
          {
            gym_id: gid,
            exercise_key: exerciseKey,
            display_name: catalog.name,
            mp4_url: mp4Url,
            storage_path: storagePath,
            youtube_url: existing?.youtube_url || null,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "gym_id,exercise_key" },
        );
        if (error) {
          return res.status(500).json({ ok: false, error: "save-failed", message: error.message });
        }
        if (existing?.storage_path && existing.storage_path !== storagePath) {
          await sb.storage.from(MEDIA_BUCKET).remove([existing.storage_path]).catch(() => null);
        }
        return res.json({
          ok: true,
          exercise: { exerciseKey, name: catalog.name, mp4Url, hasVideo: true },
        });
      }

      return res.status(400).json({ ok: false, error: "unknown-action" });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: "upload-failed",
        message: err instanceof Error ? err.message : "Upload failed",
      });
    }
  });

  app.delete("/api/portal-workout-exercise-media", requireAccess(Access.membersWrite), async (req, res) => {
    try {
      const exerciseKey = String(req.query?.exerciseKey || "").trim();
      if (!exerciseKey) return res.status(400).json({ ok: false, error: "exercise-required" });
      const sb = getSupabase();
      const gid = gymId();
      const { data: existing } = await sb
        .from(MEDIA_TABLE)
        .select("storage_path")
        .eq("gym_id", gid)
        .eq("exercise_key", exerciseKey)
        .maybeSingle();
      if (existing?.storage_path) {
        await sb.storage.from(MEDIA_BUCKET).remove([existing.storage_path]).catch(() => null);
      }
      const { error } = await sb
        .from(MEDIA_TABLE)
        .delete()
        .eq("gym_id", gid)
        .eq("exercise_key", exerciseKey);
      if (error) {
        return res.status(500).json({ ok: false, error: "delete-failed", message: error.message });
      }
      return res.json({ ok: true, exerciseKey });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: "delete-failed",
        message: err instanceof Error ? err.message : "delete-failed",
      });
    }
  });
}
