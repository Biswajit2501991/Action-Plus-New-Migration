import { Access } from "../auth/accessControl.js";
import { requireAccess } from "../middleware/permissions.js";

/**
 * Weight logs for any member (Basic portal + staff).
 * Stored in member_measurements — independent of PT plan_json.weightLogs.
 */
export function registerMemberWeightLogRoutes(app, { appendAuditLog }) {
  function normalizeDate(input) {
    const s = String(input || "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    return s;
  }

  function normalizeWeightKg(input) {
    const n = typeof input === "number" ? input : Number(String(input || "").trim());
    if (!Number.isFinite(n) || n <= 0 || n > 400) return null;
    return Math.round(n * 10) / 10;
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
    "/api/member-weight-logs/:memberKey",
    requireAccess(Access.membersRead),
    async (req, res) => {
      try {
        const { getSupabase, gymId } = await import("../db/supabase/client.js");
        const sb = getSupabase();
        const gid = gymId() || req.auth?.gymId;
        if (!sb || !gid) return res.status(500).json({ error: "supabase-unavailable" });
        const member = await resolveMemberUuid(sb, gid, req.params.memberKey);
        if (!member?.member_uuid) return res.status(404).json({ error: "member-not-found" });

        const { data, error } = await sb
          .from("member_measurements")
          .select("id, measured_at, weight_kg, notes, recorded_by, created_at")
          .eq("gym_id", gid)
          .eq("member_uuid", member.member_uuid)
          .not("weight_kg", "is", null)
          .order("measured_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(80);

        if (error) return res.status(500).json({ error: error.message || "weight-load-failed" });

        const logs = (data || []).map((row) => ({
          id: String(row.id),
          date: String(row.measured_at || "").slice(0, 10),
          weightKg: row.weight_kg != null ? Number(row.weight_kg) : null,
          notes: row.notes ? String(row.notes) : "",
          recordedBy: row.recorded_by ? String(row.recorded_by) : "",
          createdAt: row.created_at ? String(row.created_at) : "",
        }));

        const currentKg = logs[0]?.weightKg ?? null;
        const previousKg = logs[1]?.weightKg ?? null;
        const changeKg =
          currentKg != null && previousKg != null
            ? Math.round((currentKg - previousKg) * 10) / 10
            : null;

        return res.json({
          ok: true,
          memberId: member.member_code,
          memberName: member.full_name,
          planName: member.plan_name || null,
          logs,
          currentKg,
          previousKg,
          changeKg,
        });
      } catch (err) {
        return res.status(500).json({ error: err?.message || "weight-load-failed" });
      }
    },
  );

  app.post(
    "/api/member-weight-logs/:memberKey",
    requireAccess(Access.membersWrite),
    async (req, res) => {
      try {
        const { getSupabase, gymId } = await import("../db/supabase/client.js");
        const sb = getSupabase();
        const gid = gymId() || req.auth?.gymId;
        if (!sb || !gid) return res.status(500).json({ error: "supabase-unavailable" });
        const member = await resolveMemberUuid(sb, gid, req.params.memberKey);
        if (!member?.member_uuid) return res.status(404).json({ error: "member-not-found" });

        const measuredAt = normalizeDate(req.body?.date);
        const weightKg = normalizeWeightKg(req.body?.weightKg ?? req.body?.weight);
        if (!measuredAt) return res.status(400).json({ error: "invalid-date" });
        if (weightKg == null) return res.status(400).json({ error: "invalid-weight" });

        const notes = String(req.body?.notes || "").trim().slice(0, 300);
        const recordedBy =
          String(req.auth?.name || req.auth?.userName || req.auth?.id || "Staff").trim() ||
          "Staff";

        const { data: inserted, error } = await sb
          .from("member_measurements")
          .insert({
            gym_id: gid,
            member_uuid: member.member_uuid,
            measured_at: measuredAt,
            weight_kg: weightKg,
            notes: notes || null,
            metrics_json: { source: "gym_manager" },
            recorded_by: recordedBy,
          })
          .select("id, measured_at, weight_kg, notes, recorded_by, created_at")
          .single();

        if (error || !inserted) {
          return res.status(500).json({ error: error?.message || "weight-save-failed" });
        }

        if (typeof appendAuditLog === "function") {
          await appendAuditLog(req, {
            action: "member.weight_logged",
            entityType: "member",
            entityId: member.member_code,
            after: {
              date: measuredAt,
              weightKg,
              recordedBy,
            },
          }).catch(() => undefined);
        }

        return res.json({
          ok: true,
          log: {
            id: String(inserted.id),
            date: String(inserted.measured_at || "").slice(0, 10),
            weightKg: Number(inserted.weight_kg),
            notes: inserted.notes ? String(inserted.notes) : "",
            recordedBy: inserted.recorded_by ? String(inserted.recorded_by) : recordedBy,
            createdAt: inserted.created_at ? String(inserted.created_at) : "",
          },
        });
      } catch (err) {
        return res.status(500).json({ error: err?.message || "weight-save-failed" });
      }
    },
  );
}
