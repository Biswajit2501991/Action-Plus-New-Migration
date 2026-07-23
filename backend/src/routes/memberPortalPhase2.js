import { createHmac, timingSafeEqual } from "crypto";
import { env } from "../config/env.js";
import { Access } from "../auth/accessControl.js";
import { requireAccess } from "../middleware/permissions.js";
import {
  DEFAULT_BASIC_WORKOUT_OPTIONS,
  DEFAULT_PORTAL_SECTIONS,
  normalizeBasicWorkoutOptions,
  normalizePortalSections,
} from "../lib/memberPortalUiConfig.js";

function b64urlDecode(input) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function memberPortalSecret() {
  return String(
    process.env.MEMBER_PORTAL_JWT_SECRET ||
      process.env.ADMIN_SESSION_SECRET ||
      env.JWT_SECRET ||
      "",
  ).trim();
}

/** Verify APG1.<body>.<sig> member QR payload. */
export function verifyMemberQrPayload(raw) {
  const text = String(raw || "").trim();
  const parts = text.split(".");
  if (parts.length !== 3 || parts[0] !== "APG1") {
    return { ok: false, error: "invalid-qr-format" };
  }
  const [, body, sig] = parts;
  const secret = memberPortalSecret();
  if (!secret) return { ok: false, error: "qr-secret-missing" };
  const expected = createHmac("sha256", secret).update(body).digest();
  const actual = b64urlDecode(sig);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, error: "invalid-qr-signature" };
  }
  let payload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString("utf8"));
  } catch {
    return { ok: false, error: "invalid-qr-payload" };
  }
  if (!payload?.memberUuid || !payload?.qrToken) {
    return { ok: false, error: "incomplete-qr" };
  }
  if (payload.exp && Number(payload.exp) < Math.floor(Date.now() / 1000)) {
    return { ok: false, error: "qr-expired" };
  }
  return { ok: true, payload };
}

/**
 * Member Portal Phase 2 staff APIs: member QR check-in, chat, portal settings.
 */
export function registerMemberPortalPhase2Routes(app, { appendAuditLog }) {
  app.post("/api/attendance/member-checkin", requireAccess(Access.membersWrite), async (req, res) => {
    try {
      const qrPayload = String(req.body?.qrPayload || req.body?.payload || "").trim();
      if (!qrPayload) return res.status(400).json({ error: "qr-required" });

      const verified = verifyMemberQrPayload(qrPayload);
      if (!verified.ok) {
        return res.status(400).json({ error: verified.error });
      }

      const { getSupabase, gymId } = await import("../db/supabase/client.js");
      const sb = getSupabase();
      const gid = gymId() || req.auth?.gymId;
      if (!sb || !gid) return res.status(500).json({ error: "supabase-unavailable" });

      const payload = verified.payload;
      if (payload.gymId && String(payload.gymId) !== String(gid)) {
        return res.status(403).json({ error: "wrong-gym" });
      }

      const { data: member, error: mErr } = await sb
        .from("members")
        .select("member_uuid, member_code, full_name, status, qr_token, assigned_gym_code_id, portal_enabled")
        .eq("gym_id", gid)
        .eq("member_uuid", payload.memberUuid)
        .is("deleted_at", null)
        .maybeSingle();
      if (mErr) return res.status(500).json({ error: mErr.message });
      if (!member) return res.status(404).json({ error: "member-not-found" });
      if (member.qr_token && payload.qrToken && member.qr_token !== payload.qrToken) {
        return res.status(400).json({ error: "qr-token-mismatch" });
      }

      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: recent } = await sb
        .from("member_attendance_records")
        .select("id, checked_in_at")
        .eq("gym_id", gid)
        .eq("member_uuid", member.member_uuid)
        .gte("checked_in_at", since)
        .limit(1);
      if (recent?.length) {
        return res.json({
          ok: true,
          deduped: true,
          member: {
            memberCode: member.member_code,
            fullName: member.full_name,
            status: member.status,
          },
          record: recent[0],
        });
      }

      const actor = req.auth?.userId || "staff";
      const { data: record, error } = await sb
        .from("member_attendance_records")
        .insert({
          gym_id: gid,
          member_uuid: member.member_uuid,
          branch_id: member.assigned_gym_code_id || req.auth?.gymCodeId || null,
          source: "staff_scan",
          scanned_by_staff_id: actor,
        })
        .select("id, checked_in_at, source")
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });

      await appendAuditLog(req, {
        action: "member.attendance.staff_scan",
        entityType: "member",
        entityId: member.member_code,
        after: { recordId: record?.id },
      });

      return res.json({
        ok: true,
        member: {
          memberCode: member.member_code,
          fullName: member.full_name,
          status: member.status,
        },
        record,
      });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "checkin-failed" });
    }
  });

  app.get("/api/attendance/member-records", requireAccess(Access.membersWrite), async (req, res) => {
    try {
      const { getSupabase, gymId } = await import("../db/supabase/client.js");
      const sb = getSupabase();
      const gid = gymId() || req.auth?.gymId;
      if (!sb || !gid) return res.status(500).json({ error: "supabase-unavailable" });
      const memberUuid = String(req.query.memberUuid || "").trim();
      let q = sb
        .from("member_attendance_records")
        .select("id, member_uuid, checked_in_at, source, branch_id, scanned_by_staff_id")
        .eq("gym_id", gid)
        .order("checked_in_at", { ascending: false })
        .limit(100);
      if (memberUuid) q = q.eq("member_uuid", memberUuid);
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true, items: data || [] });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "list-failed" });
    }
  });

  async function getChatRetentionDays(sb, gid) {
    const { data } = await sb
      .from("member_portal_settings")
      .select("chat_retention_days")
      .eq("gym_id", gid)
      .maybeSingle();
    const days = Number(data?.chat_retention_days);
    if (Number.isFinite(days) && days >= 1 && days <= 365) return Math.floor(days);
    return 7;
  }

  /** Delete portal chat messages older than retention; does not touch other tables. */
  async function purgeExpiredPortalChat(sb, gid) {
    const days = await getChatRetentionDays(sb, gid);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { error, count } = await sb
      .from("member_portal_chat_messages")
      .delete({ count: "exact" })
      .eq("gym_id", gid)
      .lt("created_at", cutoff);
    if (error) throw new Error(error.message);
    return { days, deleted: count || 0, cutoff };
  }

  async function resolveCanonicalThread(sb, gid, memberUuid) {
    const { data: existing } = await sb
      .from("member_portal_chat_threads")
      .select("id, member_uuid, status, subject, updated_at, created_at")
      .eq("gym_id", gid)
      .eq("member_uuid", memberUuid)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) return existing;
    const { data: created, error } = await sb
      .from("member_portal_chat_threads")
      .insert({
        gym_id: gid,
        member_uuid: memberUuid,
        subject: "Member portal chat",
        status: "open",
      })
      .select("id, member_uuid, status, subject, updated_at, created_at")
      .maybeSingle();
    if (error || !created) throw new Error(error?.message || "create-thread-failed");
    return created;
  }

  async function loadMessagesForMember(sb, gid, memberUuid) {
    const { data: threads, error: tErr } = await sb
      .from("member_portal_chat_threads")
      .select("id")
      .eq("gym_id", gid)
      .eq("member_uuid", memberUuid);
    if (tErr) throw new Error(tErr.message);
    const ids = (threads || []).map((t) => t.id);
    if (!ids.length) return [];
    const { data, error } = await sb
      .from("member_portal_chat_messages")
      .select("id, sender, body, staff_name, created_at, thread_id")
      .eq("gym_id", gid)
      .in("thread_id", ids)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return data || [];
  }

  /** Member-centric list: one row per member with chat history (not one card per thread). */
  app.get("/api/portal-chat/members", requireAccess(Access.membersWrite), async (req, res) => {
    try {
      const { getSupabase, gymId } = await import("../db/supabase/client.js");
      const sb = getSupabase();
      const gid = gymId() || req.auth?.gymId;
      if (!sb || !gid) return res.status(500).json({ error: "supabase-unavailable" });

      let retentionDays = 7;
      try {
        const purged = await purgeExpiredPortalChat(sb, gid);
        retentionDays = purged.days;
      } catch {
        retentionDays = await getChatRetentionDays(sb, gid);
      }

      const { data: threads, error } = await sb
        .from("member_portal_chat_threads")
        .select("id, member_uuid, status, subject, updated_at, created_at")
        .eq("gym_id", gid)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) return res.status(500).json({ error: error.message });

      const byMember = new Map();
      for (const t of threads || []) {
        const prev = byMember.get(t.member_uuid);
        if (!prev) {
          byMember.set(t.member_uuid, {
            member_uuid: t.member_uuid,
            thread_id: t.id,
            status: t.status,
            updated_at: t.updated_at,
            created_at: t.created_at,
            thread_count: 1,
            has_open: t.status === "open",
          });
        } else {
          prev.thread_count += 1;
          if (t.status === "open") prev.has_open = true;
          if (String(t.updated_at) > String(prev.updated_at)) {
            prev.thread_id = t.id;
            prev.status = t.status;
            prev.updated_at = t.updated_at;
          }
        }
      }

      const uuids = [...byMember.keys()];
      const names = {};
      if (uuids.length) {
        const { data: members } = await sb
          .from("members")
          .select("member_uuid, full_name, member_code, mobile, status")
          .eq("gym_id", gid)
          .in("member_uuid", uuids);
        for (const m of members || []) names[m.member_uuid] = m;
      }

      const items = [...byMember.values()]
        .map((row) => ({
          ...row,
          status: row.has_open ? "open" : row.status,
          member: names[row.member_uuid] || null,
        }))
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));

      return res.json({
        ok: true,
        items,
        retentionDays,
        unreadCount: items.filter((row) => row.has_open || row.status === "open").length,
      });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "list-failed" });
    }
  });

  app.get("/api/portal-chat/unread-count", requireAccess(Access.membersWrite), async (req, res) => {
    try {
      const { getSupabase, gymId } = await import("../db/supabase/client.js");
      const sb = getSupabase();
      const gid = gymId() || req.auth?.gymId;
      if (!sb || !gid) return res.status(500).json({ error: "supabase-unavailable" });
      const { data, error } = await sb
        .from("member_portal_chat_threads")
        .select("member_uuid")
        .eq("gym_id", gid)
        .eq("status", "open")
        .limit(500);
      if (error) return res.status(500).json({ error: error.message });
      const count = new Set((data || []).map((t) => t.member_uuid)).size;
      return res.json({ ok: true, count });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "count-failed" });
    }
  });

  app.get(
    "/api/portal-chat/members/:memberUuid/messages",
    requireAccess(Access.membersWrite),
    async (req, res) => {
      try {
        const { getSupabase, gymId } = await import("../db/supabase/client.js");
        const sb = getSupabase();
        const gid = gymId() || req.auth?.gymId;
        const memberUuid = String(req.params.memberUuid || "").trim();
        if (!sb || !gid || !memberUuid) return res.status(400).json({ error: "bad-request" });
        const items = await loadMessagesForMember(sb, gid, memberUuid);
        const retentionDays = await getChatRetentionDays(sb, gid);
        return res.json({ ok: true, items, retentionDays });
      } catch (err) {
        return res.status(500).json({ error: err?.message || "list-failed" });
      }
    },
  );

  app.post(
    "/api/portal-chat/members/:memberUuid/messages",
    requireAccess(Access.membersWrite),
    async (req, res) => {
      try {
        const { getSupabase, gymId } = await import("../db/supabase/client.js");
        const sb = getSupabase();
        const gid = gymId() || req.auth?.gymId;
        const memberUuid = String(req.params.memberUuid || "").trim();
        const body = String(req.body?.body || "").trim().slice(0, 2000);
        if (!sb || !gid || !memberUuid || !body) return res.status(400).json({ error: "bad-request" });
        const thread = await resolveCanonicalThread(sb, gid, memberUuid);
        const actor = req.auth?.name || req.auth?.userId || "staff";
        const { data, error } = await sb
          .from("member_portal_chat_messages")
          .insert({
            gym_id: gid,
            thread_id: thread.id,
            sender: "staff",
            body,
            staff_name: actor,
          })
          .select("id, sender, body, staff_name, created_at")
          .maybeSingle();
        if (error) return res.status(500).json({ error: error.message });
        await sb
          .from("member_portal_chat_threads")
          .update({ updated_at: new Date().toISOString(), status: "answered" })
          .eq("id", thread.id)
          .eq("gym_id", gid);
        return res.json({ ok: true, message: data, threadId: thread.id });
      } catch (err) {
        return res.status(500).json({ error: err?.message || "send-failed" });
      }
    },
  );

  // Legacy thread endpoints kept for compatibility; messages now span all threads when using member APIs.
  app.get("/api/portal-chat/threads", requireAccess(Access.membersWrite), async (req, res) => {
    try {
      const { getSupabase, gymId } = await import("../db/supabase/client.js");
      const sb = getSupabase();
      const gid = gymId() || req.auth?.gymId;
      if (!sb || !gid) return res.status(500).json({ error: "supabase-unavailable" });
      try {
        await purgeExpiredPortalChat(sb, gid);
      } catch {
        /* non-fatal */
      }
      const { data, error } = await sb
        .from("member_portal_chat_threads")
        .select("id, member_uuid, status, subject, updated_at, created_at")
        .eq("gym_id", gid)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) return res.status(500).json({ error: error.message });
      const uuids = [...new Set((data || []).map((t) => t.member_uuid))];
      const names = {};
      if (uuids.length) {
        const { data: members } = await sb
          .from("members")
          .select("member_uuid, full_name, member_code, mobile")
          .eq("gym_id", gid)
          .in("member_uuid", uuids);
        for (const m of members || []) names[m.member_uuid] = m;
      }
      return res.json({
        ok: true,
        items: (data || []).map((t) => ({
          ...t,
          member: names[t.member_uuid] || null,
        })),
      });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "list-failed" });
    }
  });

  app.get("/api/portal-chat/threads/:id/messages", requireAccess(Access.membersWrite), async (req, res) => {
    try {
      const { getSupabase, gymId } = await import("../db/supabase/client.js");
      const sb = getSupabase();
      const gid = gymId() || req.auth?.gymId;
      const id = String(req.params.id || "").trim();
      if (!sb || !gid || !id) return res.status(400).json({ error: "bad-request" });
      const { data: thread } = await sb
        .from("member_portal_chat_threads")
        .select("member_uuid")
        .eq("gym_id", gid)
        .eq("id", id)
        .maybeSingle();
      if (thread?.member_uuid) {
        const items = await loadMessagesForMember(sb, gid, thread.member_uuid);
        return res.json({ ok: true, items });
      }
      const { data, error } = await sb
        .from("member_portal_chat_messages")
        .select("id, sender, body, staff_name, created_at")
        .eq("gym_id", gid)
        .eq("thread_id", id)
        .order("created_at", { ascending: true })
        .limit(300);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true, items: data || [] });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "list-failed" });
    }
  });

  app.post("/api/portal-chat/threads/:id/messages", requireAccess(Access.membersWrite), async (req, res) => {
    try {
      const { getSupabase, gymId } = await import("../db/supabase/client.js");
      const sb = getSupabase();
      const gid = gymId() || req.auth?.gymId;
      const id = String(req.params.id || "").trim();
      const body = String(req.body?.body || "").trim().slice(0, 2000);
      if (!sb || !gid || !id || !body) return res.status(400).json({ error: "bad-request" });
      const { data: thread } = await sb
        .from("member_portal_chat_threads")
        .select("id, member_uuid")
        .eq("gym_id", gid)
        .eq("id", id)
        .maybeSingle();
      if (!thread) return res.status(404).json({ error: "thread-not-found" });
      const canonical = await resolveCanonicalThread(sb, gid, thread.member_uuid);
      const actor = req.auth?.name || req.auth?.userId || "staff";
      const { data, error } = await sb
        .from("member_portal_chat_messages")
        .insert({
          gym_id: gid,
          thread_id: canonical.id,
          sender: "staff",
          body,
          staff_name: actor,
        })
        .select("id, sender, body, staff_name, created_at")
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      await sb
        .from("member_portal_chat_threads")
        .update({ updated_at: new Date().toISOString(), status: "answered" })
        .eq("id", canonical.id)
        .eq("gym_id", gid);
      return res.json({ ok: true, message: data });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "send-failed" });
    }
  });

  app.post("/api/portal-chat/purge", requireAccess(Access.membersWrite), async (req, res) => {
    try {
      const { getSupabase, gymId } = await import("../db/supabase/client.js");
      const sb = getSupabase();
      const gid = gymId() || req.auth?.gymId;
      if (!sb || !gid) return res.status(500).json({ error: "supabase-unavailable" });
      const result = await purgeExpiredPortalChat(sb, gid);
      await appendAuditLog(req, {
        action: "portal.chat.purge",
        entityType: "member_portal_chat",
        entityId: gid,
        after: result,
      });
      return res.json({ ok: true, ...result });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "purge-failed" });
    }
  });

  app.get("/api/portal-settings", requireAccess(Access.membersWrite), async (req, res) => {
    try {
      const { getSupabase, gymId } = await import("../db/supabase/client.js");
      const sb = getSupabase();
      const gid = gymId() || req.auth?.gymId;
      if (!sb || !gid) return res.status(500).json({ error: "supabase-unavailable" });
      const { data } = await sb
        .from("member_portal_settings")
        .select("*")
        .eq("gym_id", gid)
        .maybeSingle();
      const settings = data || {
        gym_id: gid,
        billing_push_enabled: true,
        billing_push_title: "Billing reminder",
        billing_push_body:
          "Your membership billing date is today. Please renew at the gym.",
        billing_match_field: "next_payment_date",
        chat_retention_days: 7,
        auth_method: "whatsapp_staff",
        basic_workout_options: DEFAULT_BASIC_WORKOUT_OPTIONS,
        portal_sections: DEFAULT_PORTAL_SECTIONS,
      };
      return res.json({
        ok: true,
        settings: {
          ...settings,
          basic_workout_options: normalizeBasicWorkoutOptions(
            settings.basic_workout_options,
          ),
          portal_sections: normalizePortalSections(settings.portal_sections),
        },
      });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "load-failed" });
    }
  });

  app.put("/api/portal-settings", requireAccess(Access.membersWrite), async (req, res) => {
    try {
      const { getSupabase, gymId } = await import("../db/supabase/client.js");
      const sb = getSupabase();
      const gid = gymId() || req.auth?.gymId;
      if (!sb || !gid) return res.status(500).json({ error: "supabase-unavailable" });

      const { data: existing } = await sb
        .from("member_portal_settings")
        .select("*")
        .eq("gym_id", gid)
        .maybeSingle();

      const retentionRaw =
        req.body?.chat_retention_days !== undefined
          ? Number(req.body.chat_retention_days)
          : Number(existing?.chat_retention_days ?? 7);
      const chatRetentionDays =
        Number.isFinite(retentionRaw) && retentionRaw >= 1 && retentionRaw <= 365
          ? Math.floor(retentionRaw)
          : 7;

      const authMethodRaw = String(
        req.body?.auth_method ?? existing?.auth_method ?? "whatsapp_staff",
      ).trim();
      const authMethod =
        authMethodRaw === "auto_identity" ? "auto_identity" : "whatsapp_staff";

      const basicWorkoutOptions = normalizeBasicWorkoutOptions(
        req.body?.basic_workout_options !== undefined
          ? req.body.basic_workout_options
          : existing?.basic_workout_options,
      );
      const portalSections = normalizePortalSections(
        req.body?.portal_sections !== undefined
          ? req.body.portal_sections
          : existing?.portal_sections,
      );

      const row = {
        gym_id: gid,
        billing_push_enabled: Boolean(
          req.body?.billing_push_enabled ?? existing?.billing_push_enabled ?? true,
        ),
        billing_push_title: String(
          req.body?.billing_push_title || existing?.billing_push_title || "Billing reminder",
        ).slice(0, 120),
        billing_push_body: String(
          req.body?.billing_push_body ||
            existing?.billing_push_body ||
            "Your membership billing date is today. Please renew at the gym.",
        ).slice(0, 500),
        billing_match_field:
          (req.body?.billing_match_field || existing?.billing_match_field) === "billing_date"
            ? "billing_date"
            : "next_payment_date",
        chat_retention_days: chatRetentionDays,
        auth_method: authMethod,
        basic_workout_options: basicWorkoutOptions,
        portal_sections: portalSections,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await sb
        .from("member_portal_settings")
        .upsert(row, { onConflict: "gym_id" })
        .select("*")
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({
        ok: true,
        settings: {
          ...data,
          basic_workout_options: normalizeBasicWorkoutOptions(
            data?.basic_workout_options,
          ),
          portal_sections: normalizePortalSections(data?.portal_sections),
        },
      });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "save-failed" });
    }
  });
}
