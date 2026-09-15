/**
 * Owner gym-wide Member Portal Web Push broadcast (proxy to Gym Website).
 * Immediate send + scheduled jobs. Does not rewrite members, billing cron, or WhatsApp.
 */

import { requireOwner } from "../middleware/requireOwner.js";

/** Production Member Portal / Gym Website origin (override with MEMBER_PORTAL_SITE_URL). */
const DEFAULT_PORTAL_SITE_URL = "https://www.actionplusgym.com";

function portalSiteBase() {
  return String(
    process.env.MEMBER_PORTAL_SITE_URL
      || process.env.GYM_WEBSITE_URL
      || process.env.NEXT_PUBLIC_MEMBER_PORTAL_URL
      || process.env.NEXT_PUBLIC_SITE_URL
      || DEFAULT_PORTAL_SITE_URL,
  )
    .trim()
    .replace(/\/+$/, "");
}

function portalCronSecret() {
  return String(process.env.MEMBER_PORTAL_CRON_SECRET || "").trim();
}

async function callWebsite(path, method, payload) {
  const base = portalSiteBase();
  const secret = portalCronSecret();
  if (!base) {
    const err = new Error(
      "MEMBER_PORTAL_SITE_URL is not set on Gym Manager (Website base URL).",
    );
    err.status = 503;
    err.code = "portal-site-url-missing";
    throw err;
  }
  if (!secret) {
    const err = new Error(
      "MEMBER_PORTAL_CRON_SECRET is not set on Gym Manager (must match Website MEMBER_PORTAL_CRON_SECRET).",
    );
    err.status = 503;
    err.code = "portal-cron-secret-missing";
    throw err;
  }

  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(method === "POST" || method === "PUT" || method === "PATCH"
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body:
      method === "POST" || method === "PUT" || method === "PATCH"
        ? JSON.stringify(payload || {})
        : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err = new Error(
      data?.message || data?.error || `Website request failed (${res.status})`,
    );
    err.status = res.status;
    err.code = data?.error || "broadcast-proxy-failed";
    err.detail = data;
    throw err;
  }
  return data || { ok: true };
}

async function callWebsiteBroadcast(method, payload) {
  return callWebsite("/api/member/push/broadcast", method, payload);
}

export function registerPortalPushBroadcastRoutes(app, { appendAuditLog } = {}) {
  app.get("/api/portal-push-broadcast", requireOwner, async (_req, res) => {
    try {
      const data = await callWebsiteBroadcast("GET");
      return res.json(data);
    } catch (err) {
      return res.status(err?.status || 500).json({
        ok: false,
        error: err?.code || "broadcast-preview-failed",
        message: err?.message || "Could not load broadcast recipients",
        detail: err?.detail,
      });
    }
  });

  app.post("/api/portal-push-broadcast", requireOwner, async (req, res) => {
    try {
      const title = String(req.body?.title || "").trim().slice(0, 120);
      const body = String(req.body?.body || "").trim().slice(0, 500);
      if (!title || !body) {
        return res.status(400).json({
          ok: false,
          error: "title-and-body-required",
          message: "Title and message are required.",
        });
      }

      const data = await callWebsiteBroadcast("POST", {
        title,
        body,
        url: typeof req.body?.url === "string" ? req.body.url : "/members",
      });

      if (typeof appendAuditLog === "function") {
        await appendAuditLog(req, {
          action: "portal.push.broadcast",
          entityType: "member_portal_push",
          entityId: "owner_broadcast",
          after: {
            title,
            recipients: data?.recipients,
            membersSent: data?.membersSent,
            pushSent: data?.pushSent,
            pushFailed: data?.pushFailed,
          },
        });
      }

      return res.json(data);
    } catch (err) {
      return res.status(err?.status || 500).json({
        ok: false,
        error: err?.code || "broadcast-failed",
        message: err?.message || "Broadcast failed",
        detail: err?.detail,
      });
    }
  });

  app.get("/api/portal-push-broadcast/jobs", requireOwner, async (_req, res) => {
    try {
      const data = await callWebsite("/api/member/push/broadcast/jobs", "GET");
      return res.json(data);
    } catch (err) {
      return res.status(err?.status || 500).json({
        ok: false,
        error: err?.code || "broadcast-jobs-list-failed",
        message: err?.message || "Could not load scheduled broadcasts",
        detail: err?.detail,
      });
    }
  });

  app.post("/api/portal-push-broadcast/jobs", requireOwner, async (req, res) => {
    try {
      const title = String(req.body?.title || "").trim().slice(0, 120);
      const body = String(req.body?.body || "").trim().slice(0, 500);
      const scheduledAt = String(req.body?.scheduledAt || req.body?.scheduled_at || "").trim();
      if (!title || !body) {
        return res.status(400).json({
          ok: false,
          error: "title-and-body-required",
          message: "Title and message are required.",
        });
      }
      if (!scheduledAt) {
        return res.status(400).json({
          ok: false,
          error: "scheduled-at-required",
          message: "Pick a future date and time.",
        });
      }

      // Refresh count before schedule (display / audit); send path refreshes again.
      let recipientsPreview = null;
      try {
        const preview = await callWebsiteBroadcast("GET");
        recipientsPreview = Number(preview?.recipients) || 0;
      } catch {
        recipientsPreview = null;
      }

      const data = await callWebsite("/api/member/push/broadcast/jobs", "POST", {
        title,
        body,
        url: typeof req.body?.url === "string" ? req.body.url : "/members",
        scheduledAt,
        createdBy: String(req.auth?.userId || "owner"),
      });

      if (typeof appendAuditLog === "function") {
        await appendAuditLog(req, {
          action: "portal.push.broadcast.scheduled",
          entityType: "member_portal_push_broadcast_job",
          entityId: data?.job?.id || "scheduled",
          after: {
            title,
            scheduledAt,
            recipientsPreview,
            jobId: data?.job?.id,
          },
        });
      }

      return res.json({
        ...data,
        recipientsPreview,
      });
    } catch (err) {
      return res.status(err?.status || 500).json({
        ok: false,
        error: err?.code || "broadcast-schedule-failed",
        message: err?.message || "Could not schedule broadcast",
        detail: err?.detail,
      });
    }
  });

  app.post(
    "/api/portal-push-broadcast/jobs/:id/cancel",
    requireOwner,
    async (req, res) => {
      try {
        const id = encodeURIComponent(String(req.params.id || "").trim());
        if (!id) {
          return res.status(400).json({
            ok: false,
            error: "job-id-required",
            message: "Job id required.",
          });
        }
        const data = await callWebsite(
          `/api/member/push/broadcast/jobs/${id}/cancel`,
          "POST",
          {},
        );
        if (typeof appendAuditLog === "function") {
          await appendAuditLog(req, {
            action: "portal.push.broadcast.cancelled",
            entityType: "member_portal_push_broadcast_job",
            entityId: String(req.params.id || ""),
            after: { jobId: data?.job?.id, status: data?.job?.status },
          });
        }
        return res.json(data);
      } catch (err) {
        return res.status(err?.status || 500).json({
          ok: false,
          error: err?.code || "broadcast-cancel-failed",
          message: err?.message || "Could not cancel broadcast",
          detail: err?.detail,
        });
      }
    },
  );
}
