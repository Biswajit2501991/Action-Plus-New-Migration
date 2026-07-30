import { Access } from "../auth/accessControl.js";
import { requireAccess } from "../middleware/permissions.js";

/**
 * Shared weight logs for Basic + PT (portal, Members → Workout, PT → Weight Progress).
 * Source of truth: member_measurements.
 * Legacy PT plan_json.weightLogs are migrated into member_measurements on read (no data loss).
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
        .select("id, member_uuid, member_code, full_name, status, plan_name")
        .eq("gym_id", gid)
        .eq("member_uuid", key)
        .is("deleted_at", null)
        .maybeSingle();
      return data || null;
    }
    const { data } = await sb
      .from("members")
      .select("id, member_uuid, member_code, full_name, status, plan_name")
      .eq("gym_id", gid)
      .eq("member_code", key)
      .is("deleted_at", null)
      .maybeSingle();
    if (data) return data;
    const asNum = Number(key);
    if (Number.isFinite(asNum) && asNum > 0) {
      const { data: byId } = await sb
        .from("members")
        .select("id, member_uuid, member_code, full_name, status, plan_name")
        .eq("gym_id", gid)
        .eq("id", asNum)
        .is("deleted_at", null)
        .maybeSingle();
      return byId || null;
    }
    return null;
  }

  function mapLogs(rows) {
    return (rows || []).map((row) => ({
      id: String(row.id),
      date: String(row.measured_at || "").slice(0, 10),
      weightKg: row.weight_kg != null ? Number(row.weight_kg) : null,
      notes: row.notes ? String(row.notes) : "",
      recordedBy: row.recorded_by ? String(row.recorded_by) : "",
      createdAt: row.created_at ? String(row.created_at) : "",
    }));
  }

  /**
   * Copy legacy PT plan_json.weightLogs into member_measurements once.
   * Idempotent: skips date+weight pairs already present.
   */
  async function migrateLegacyPtWeightLogs(sb, gid, member) {
    if (!member?.id || !member?.member_uuid) return 0;
    const { data: profileRow } = await sb
      .from("pt_client_profiles")
      .select("plan_json")
      .eq("gym_id", gid)
      .eq("member_id", member.id)
      .maybeSingle();

    const legacy = Array.isArray(profileRow?.plan_json?.weightLogs)
      ? profileRow.plan_json.weightLogs
      : [];
    if (!legacy.length) return 0;

    const { data: existing } = await sb
      .from("member_measurements")
      .select("measured_at, weight_kg")
      .eq("gym_id", gid)
      .eq("member_uuid", member.member_uuid)
      .not("weight_kg", "is", null)
      .limit(200);

    const seen = new Set(
      (existing || []).map(
        (r) =>
          `${String(r.measured_at || "").slice(0, 10)}:${Number(r.weight_kg)}`,
      ),
    );

    const toInsert = [];
    for (const entry of legacy) {
      const date = normalizeDate(entry?.date);
      const weightKg = normalizeWeightKg(entry?.weight ?? entry?.weightKg);
      if (!date || weightKg == null) continue;
      const key = `${date}:${weightKg}`;
      if (seen.has(key)) continue;
      seen.add(key);
      toInsert.push({
        gym_id: gid,
        member_uuid: member.member_uuid,
        measured_at: date,
        weight_kg: weightKg,
        notes: null,
        metrics_json: {
          source: "migrated_plan_json",
          legacyId: entry?.id ? String(entry.id) : null,
        },
        recorded_by: "trainer",
        created_at: entry?.createdAt
          ? String(entry.createdAt)
          : new Date().toISOString(),
      });
    }

    if (!toInsert.length) return 0;
    const { error } = await sb.from("member_measurements").insert(toInsert);
    if (error) {
      console.error("migrateLegacyPtWeightLogs", error);
      return 0;
    }
    return toInsert.length;
  }

  const canReadWeight = (a) =>
    Access.membersRead(a) || Access.ptClientsRead(a);
  const canWriteWeight = (a) =>
    Access.membersWrite(a) || Access.ptClientsWriteWorkout(a);

  app.get(
    "/api/member-weight-logs/:memberKey",
    requireAccess(canReadWeight),
    async (req, res) => {
      try {
        const { getSupabase, gymId } = await import("../db/supabase/client.js");
        const sb = getSupabase();
        const gid = gymId() || req.auth?.gymId;
        if (!sb || !gid) return res.status(500).json({ error: "supabase-unavailable" });
        const member = await resolveMemberUuid(sb, gid, req.params.memberKey);
        if (!member?.member_uuid) return res.status(404).json({ error: "member-not-found" });

        await migrateLegacyPtWeightLogs(sb, gid, member);

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

        const logs = mapLogs(data);
        const currentKg = logs[0]?.weightKg ?? null;
        const previousKg = logs[1]?.weightKg ?? null;
        const changeKg =
          currentKg != null && previousKg != null
            ? Math.round((currentKg - previousKg) * 10) / 10
            : null;

        // Start → latest (oldest first) for PT trend card / celebration parity.
        const chronological = [...logs].reverse();
        const startKg = chronological[0]?.weightKg ?? null;
        const fromStartKg =
          startKg != null && currentKg != null
            ? Math.round((currentKg - startKg) * 10) / 10
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
          startKg,
          fromStartKg,
        });
      } catch (err) {
        return res.status(500).json({ error: err?.message || "weight-load-failed" });
      }
    },
  );

  app.post(
    "/api/member-weight-logs/:memberKey",
    requireAccess(canWriteWeight),
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
