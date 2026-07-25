import { Access } from "../auth/accessControl.js";
import { requireAccess } from "../middleware/permissions.js";

/**
 * Daily workout logs for any member (basic or PT).
 * Independent of pt_client_profiles — no PT plan gate.
 */
export function registerMemberDailyWorkoutRoutes(app, { appendAuditLog }) {
  function normalizeExercises(input) {
    if (!Array.isArray(input)) return [];
    const out = [];
    const seen = new Set();
    for (const raw of input) {
      const label = String(raw || "").trim().slice(0, 80);
      if (!label) continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(label);
      if (out.length >= 20) break;
    }
    return out;
  }

  function normalizeDate(input) {
    const s = String(input || "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    return s;
  }

  async function resolveMemberUuid(sb, gid, memberIdOrUuid) {
    const key = String(memberIdOrUuid || "").trim();
    if (!key) return null;
    if (/^[0-9a-f-]{36}$/i.test(key)) {
      const { data } = await sb
        .from("members")
        .select("member_uuid, member_code, full_name, status, plan_name")
        .eq("gym_id", gid)
        .eq("member_uuid", key)
        .is("deleted_at", null)
        .maybeSingle();
      return data || null;
    }
    const { data } = await sb
      .from("members")
      .select("member_uuid, member_code, full_name, status, plan_name")
      .eq("gym_id", gid)
      .eq("member_code", key)
      .is("deleted_at", null)
      .maybeSingle();
    if (data) return data;
    const asNum = Number(key);
    if (Number.isFinite(asNum) && asNum > 0) {
      const { data: byId } = await sb
        .from("members")
        .select("member_uuid, member_code, full_name, status, plan_name")
        .eq("gym_id", gid)
        .eq("id", asNum)
        .is("deleted_at", null)
        .maybeSingle();
      return byId || null;
    }
    return null;
  }

  app.get(
    "/api/member-daily-workouts/:memberKey",
    requireAccess(Access.membersRead),
    async (req, res) => {
      try {
        const { getSupabase, gymId } = await import("../db/supabase/client.js");
        const sb = getSupabase();
        const gid = gymId() || req.auth?.gymId;
        if (!sb || !gid) return res.status(500).json({ error: "supabase-unavailable" });
        const member = await resolveMemberUuid(sb, gid, req.params.memberKey);
        if (!member?.member_uuid) return res.status(404).json({ error: "member-not-found" });

        const from = normalizeDate(req.query.from) || null;
        const to = normalizeDate(req.query.to) || null;
        let q = sb
          .from("member_daily_workouts")
          .select(
            "id, member_uuid, workout_date, exercises, notes, recorded_by, source, updated_at",
          )
          .eq("gym_id", gid)
          .eq("member_uuid", member.member_uuid)
          .order("workout_date", { ascending: false })
          .limit(400);
        if (from) q = q.gte("workout_date", from);
        if (to) q = q.lte("workout_date", to);
        const { data, error } = await q;
        if (error) return res.status(500).json({ error: error.message });

        const byDate = {};
        for (const row of data || []) {
          const key = String(row.workout_date).slice(0, 10);
          byDate[key] = {
            id: row.id,
            exercises: Array.isArray(row.exercises) ? row.exercises : [],
            notes: row.notes || "",
            recorded_by: row.recorded_by || null,
            source: row.source || "gym_manager",
            updated_at: row.updated_at,
          };
        }

        return res.json({
          ok: true,
          member: {
            memberUuid: member.member_uuid,
            memberCode: member.member_code,
            fullName: member.full_name,
            status: member.status,
            planName: member.plan_name,
          },
          byDate,
          items: data || [],
        });
      } catch (err) {
        return res.status(500).json({ error: err?.message || "load-failed" });
      }
    },
  );

  app.put(
    "/api/member-daily-workouts/:memberKey",
    requireAccess(Access.membersWrite),
    async (req, res) => {
      try {
        const { getSupabase, gymId } = await import("../db/supabase/client.js");
        const sb = getSupabase();
        const gid = gymId() || req.auth?.gymId;
        if (!sb || !gid) return res.status(500).json({ error: "supabase-unavailable" });
        const member = await resolveMemberUuid(sb, gid, req.params.memberKey);
        if (!member?.member_uuid) return res.status(404).json({ error: "member-not-found" });

        const status = String(member.status || "").trim().toLowerCase();
        if (status === "deactivated" || status === "cancelled") {
          return res.status(403).json({
            error: "member-inactive",
            message: "Cannot log workouts for a deactivated or cancelled member.",
          });
        }

        const workoutDate = normalizeDate(req.body?.workoutDate || req.body?.date);
        if (!workoutDate) {
          return res.status(400).json({ error: "workout-date-required" });
        }
        const exercises = normalizeExercises(req.body?.exercises);
        const notes = String(req.body?.notes || "").trim().slice(0, 1000);
        const actor = req.auth?.name || req.auth?.userId || "staff";

        if (!exercises.length && !notes) {
          const { error: delErr } = await sb
            .from("member_daily_workouts")
            .delete()
            .eq("gym_id", gid)
            .eq("member_uuid", member.member_uuid)
            .eq("workout_date", workoutDate);
          if (delErr) return res.status(500).json({ error: delErr.message });
          await appendAuditLog(req, {
            action: "member.daily_workout.clear",
            entityType: "member",
            entityId: member.member_code,
            after: { workoutDate },
          });
          return res.json({ ok: true, cleared: true, workoutDate });
        }

        const row = {
          gym_id: gid,
          member_uuid: member.member_uuid,
          workout_date: workoutDate,
          exercises,
          notes,
          recorded_by: actor,
          source: "gym_manager",
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await sb
          .from("member_daily_workouts")
          .upsert(row, { onConflict: "gym_id,member_uuid,workout_date" })
          .select(
            "id, member_uuid, workout_date, exercises, notes, recorded_by, source, updated_at",
          )
          .maybeSingle();
        if (error) return res.status(500).json({ error: error.message });

        await appendAuditLog(req, {
          action: "member.daily_workout.save",
          entityType: "member",
          entityId: member.member_code,
          after: { workoutDate, exercises, notes },
        });

        return res.json({ ok: true, item: data });
      } catch (err) {
        return res.status(500).json({ error: err?.message || "save-failed" });
      }
    },
  );
}
