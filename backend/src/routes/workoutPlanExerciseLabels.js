import { Access } from "../auth/accessControl.js";
import { requireAccess } from "../middleware/permissions.js";
import { getSupabase, gymId } from "../db/supabase/client.js";

const TABLE = "portal_workout_exercise_labels";

function isMissingTableError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""}`;
  return /portal_workout_exercise_labels/i.test(msg) && /schema cache|does not exist|relation/i.test(msg);
}

export function registerWorkoutPlanExerciseLabelRoutes(app) {
  app.get("/api/portal-workout-exercise-labels", requireAccess(Access.membersWrite), async (_req, res) => {
    try {
      const sb = getSupabase();
      const gid = gymId();
      const { data, error } = await sb
        .from(TABLE)
        .select("exercise_key, display_name, updated_at")
        .eq("gym_id", gid)
        .order("exercise_key", { ascending: true });
      if (error) {
        if (isMissingTableError(error)) {
          return res.json({
            ok: true,
            items: [],
            hint: "Run backend/migrations/supabase_portal_workout_exercise_labels.sql",
          });
        }
        return res.status(500).json({ ok: false, error: "load-failed", message: error.message });
      }
      const items = (data || []).map((row) => ({
        exerciseKey: String(row.exercise_key || ""),
        displayName: String(row.display_name || ""),
        updatedAt: row.updated_at || null,
      }));
      return res.json({ ok: true, items });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: "load-failed",
        message: err instanceof Error ? err.message : "load-failed",
      });
    }
  });

  app.post("/api/portal-workout-exercise-labels", requireAccess(Access.membersWrite), async (req, res) => {
    try {
      const exerciseKey = String(req.body?.exerciseKey || req.body?.exercise_key || "")
        .trim()
        .toLowerCase();
      const displayName = String(req.body?.displayName || req.body?.display_name || "")
        .trim()
        .slice(0, 80);
      if (!/^[a-z][a-z0-9_]{1,63}$/.test(exerciseKey)) {
        return res.status(400).json({ ok: false, error: "invalid-exercise-key" });
      }
      if (!displayName) {
        return res.status(400).json({ ok: false, error: "name-required" });
      }

      const sb = getSupabase();
      const gid = gymId();
      const { data, error } = await sb
        .from(TABLE)
        .upsert(
          {
            gym_id: gid,
            exercise_key: exerciseKey,
            display_name: displayName,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "gym_id,exercise_key" },
        )
        .select("exercise_key, display_name, updated_at")
        .single();

      if (error) {
        if (isMissingTableError(error)) {
          return res.status(503).json({
            ok: false,
            error: "table-missing",
            message: "Run backend/migrations/supabase_portal_workout_exercise_labels.sql",
          });
        }
        return res.status(500).json({ ok: false, error: "save-failed", message: error.message });
      }

      // Keep staff-added day rows in sync for the same key.
      try {
        await sb
          .from("portal_workout_day_exercises")
          .update({ name: displayName, updated_at: new Date().toISOString() })
          .eq("gym_id", gid)
          .eq("exercise_key", exerciseKey)
          .eq("is_active", true);
      } catch {
        /* day extras optional */
      }

      // Keep video library display names in sync (additive update; no delete).
      try {
        await sb
          .from("portal_workout_exercise_media")
          .update({ display_name: displayName, updated_at: new Date().toISOString() })
          .eq("gym_id", gid)
          .eq("exercise_key", exerciseKey);
      } catch {
        /* media optional — rename label still saved */
      }

      return res.json({
        ok: true,
        item: {
          exerciseKey: String(data.exercise_key),
          displayName: String(data.display_name),
          updatedAt: data.updated_at || null,
        },
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: "save-failed",
        message: err instanceof Error ? err.message : "save-failed",
      });
    }
  });

  app.delete("/api/portal-workout-exercise-labels/:exerciseKey", requireAccess(Access.membersWrite), async (req, res) => {
    try {
      const exerciseKey = String(req.params.exerciseKey || "").trim().toLowerCase();
      if (!exerciseKey) return res.status(400).json({ ok: false, error: "invalid-exercise-key" });
      const sb = getSupabase();
      const gid = gymId();
      const { error } = await sb
        .from(TABLE)
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
