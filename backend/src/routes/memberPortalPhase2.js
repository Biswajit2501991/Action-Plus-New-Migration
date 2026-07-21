import { createHmac, timingSafeEqual } from "crypto";
import { env } from "../config/env.js";
import { Access } from "../auth/accessControl.js";
import { requireAccess } from "../middleware/permissions.js";

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

  app.get("/api/portal-chat/threads", requireAccess(Access.membersWrite), async (req, res) => {
    try {
      const { getSupabase, gymId } = await import("../db/supabase/client.js");
      const sb = getSupabase();
      const gid = gymId() || req.auth?.gymId;
      if (!sb || !gid) return res.status(500).json({ error: "supabase-unavailable" });
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
      const actor = req.auth?.name || req.auth?.userId || "staff";
      const { data, error } = await sb
        .from("member_portal_chat_messages")
        .insert({
          gym_id: gid,
          thread_id: id,
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
        .eq("id", id)
        .eq("gym_id", gid);
      return res.json({ ok: true, message: data });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "send-failed" });
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
      return res.json({
        ok: true,
        settings: data || {
          gym_id: gid,
          billing_push_enabled: true,
          billing_push_title: "Billing reminder",
          billing_push_body:
            "Your membership billing date is today. Please renew at the gym.",
          billing_match_field: "next_payment_date",
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
      const row = {
        gym_id: gid,
        billing_push_enabled: Boolean(req.body?.billing_push_enabled ?? true),
        billing_push_title: String(req.body?.billing_push_title || "Billing reminder").slice(0, 120),
        billing_push_body: String(
          req.body?.billing_push_body ||
            "Your membership billing date is today. Please renew at the gym.",
        ).slice(0, 500),
        billing_match_field:
          req.body?.billing_match_field === "billing_date"
            ? "billing_date"
            : "next_payment_date",
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await sb
        .from("member_portal_settings")
        .upsert(row, { onConflict: "gym_id" })
        .select("*")
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true, settings: data });
    } catch (err) {
      return res.status(500).json({ error: err?.message || "save-failed" });
    }
  });
}
