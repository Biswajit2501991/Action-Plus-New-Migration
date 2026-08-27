import { Access } from "../auth/accessControl.js";
import { requireAccess } from "../middleware/permissions.js";
import { getSupabase, gymId } from "../db/supabase/client.js";
import { env } from "../config/env.js";

const TABLE = "portal_workout_music";
const MEDIA_BUCKET = "website-media";
const MAX_BYTES = 500 * 1024 * 1024;

function isMissingTableError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""}`;
  return /portal_workout_music/i.test(msg) && /schema cache|does not exist|relation/i.test(msg);
}

function publicUrl(storagePath) {
  const base = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${MEDIA_BUCKET}/${storagePath}`;
}

function rowToApp(row) {
  if (!row) return null;
  const mp4Url = String(row.mp4_url || "").trim() || null;
  return {
    title: String(row.title || "Gym music").trim() || "Gym music",
    mp4Url,
    storagePath: String(row.storage_path || "").trim() || null,
    fileSizeBytes: Number(row.file_size_bytes) || null,
    hasMusic: Boolean(mp4Url),
    isActive: row.is_active !== false,
    updatedAt: row.updated_at || null,
    maxBytes: MAX_BYTES,
  };
}

export function registerWorkoutPlanMusicRoutes(app) {
  app.get("/api/portal-workout-music", requireAccess(Access.membersWrite), async (_req, res) => {
    try {
      const sb = getSupabase();
      const gid = gymId();
      const { data, error } = await sb.from(TABLE).select("*").eq("gym_id", gid).maybeSingle();
      if (error) {
        if (isMissingTableError(error)) {
          return res.json({
            ok: true,
            music: null,
            maxBytes: MAX_BYTES,
            hint: "Run backend/migrations/supabase_portal_workout_music.sql",
          });
        }
        return res.status(500).json({ ok: false, error: "load-failed", message: error.message });
      }
      return res.json({ ok: true, music: rowToApp(data), maxBytes: MAX_BYTES });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: "load-failed",
        message: err instanceof Error ? err.message : "load-failed",
      });
    }
  });

  app.post("/api/portal-workout-music", requireAccess(Access.membersWrite), async (req, res) => {
    try {
      const action = String(req.body?.action || "").trim();
      const sb = getSupabase();
      const gid = gymId();
      const title = String(req.body?.title || "Gym music").trim().slice(0, 80) || "Gym music";

      if (action === "sign") {
        const fileSize = Number(req.body?.fileSize || 0);
        if (!Number.isFinite(fileSize) || fileSize <= 0) {
          return res.status(400).json({ ok: false, error: "invalid-size" });
        }
        if (fileSize > MAX_BYTES) {
          return res.status(400).json({
            ok: false,
            error: "too-large",
            message: "Music file must be 500 MB or smaller.",
          });
        }
        const storagePath = `workout-plan-music/${gid}/track-${Date.now()}.mp4`;
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
          storagePath,
          uploadUrl: data.signedUrl,
          token: data.token || "",
          maxBytes: MAX_BYTES,
        });
      }

      if (action === "commit") {
        const storagePath = String(req.body?.storagePath || "").trim();
        const fileSize = Number(req.body?.fileSize || 0);
        const expectedPrefix = `workout-plan-music/${gid}/track-`;
        if (!storagePath.startsWith(expectedPrefix) || !storagePath.endsWith(".mp4")) {
          return res.status(400).json({ ok: false, error: "invalid-path" });
        }
        const mp4Url = publicUrl(storagePath);
        const { data: existing } = await sb
          .from(TABLE)
          .select("storage_path")
          .eq("gym_id", gid)
          .maybeSingle();
        const { data, error } = await sb
          .from(TABLE)
          .upsert(
            {
              gym_id: gid,
              title,
              mp4_url: mp4Url,
              storage_path: storagePath,
              file_size_bytes: Number.isFinite(fileSize) && fileSize > 0 ? Math.floor(fileSize) : null,
              is_active: true,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "gym_id" },
          )
          .select("*")
          .maybeSingle();
        if (error) {
          if (isMissingTableError(error)) {
            return res.status(503).json({
              ok: false,
              error: "table-missing",
              message: "Run backend/migrations/supabase_portal_workout_music.sql",
            });
          }
          return res.status(500).json({ ok: false, error: "save-failed", message: error.message });
        }
        if (existing?.storage_path && existing.storage_path !== storagePath) {
          await sb.storage.from(MEDIA_BUCKET).remove([existing.storage_path]).catch(() => null);
        }
        return res.json({ ok: true, music: rowToApp(data) });
      }

      if (action === "title") {
        const { data, error } = await sb
          .from(TABLE)
          .update({ title, updated_at: new Date().toISOString() })
          .eq("gym_id", gid)
          .select("*")
          .maybeSingle();
        if (error) {
          return res.status(500).json({ ok: false, error: "save-failed", message: error.message });
        }
        if (!data) return res.status(404).json({ ok: false, error: "not-found" });
        return res.json({ ok: true, music: rowToApp(data) });
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

  app.delete("/api/portal-workout-music", requireAccess(Access.membersWrite), async (_req, res) => {
    try {
      const sb = getSupabase();
      const gid = gymId();
      const { data: existing } = await sb
        .from(TABLE)
        .select("storage_path")
        .eq("gym_id", gid)
        .maybeSingle();
      if (existing?.storage_path) {
        await sb.storage.from(MEDIA_BUCKET).remove([existing.storage_path]).catch(() => null);
      }
      const { error } = await sb.from(TABLE).delete().eq("gym_id", gid);
      if (error) {
        return res.status(500).json({ ok: false, error: "delete-failed", message: error.message });
      }
      return res.json({ ok: true, music: null });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: "delete-failed",
        message: err instanceof Error ? err.message : "delete-failed",
      });
    }
  });
}
