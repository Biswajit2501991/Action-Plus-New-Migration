/**
 * Owner gym-wide Member Portal Web Push broadcast (proxy to Gym Website).
 * Does not rewrite members, billing cron, or WhatsApp.
 */

import { requireOwner } from "../middleware/requireOwner.js";

function portalSiteBase() {
  return String(
    process.env.MEMBER_PORTAL_SITE_URL
      || process.env.GYM_WEBSITE_URL
      || process.env.NEXT_PUBLIC_MEMBER_PORTAL_URL
      || "",
  )
    .trim()
    .replace(/\/+$/, "");
}

function portalCronSecret() {
  return String(process.env.MEMBER_PORTAL_CRON_SECRET || "").trim();
}

async function callWebsiteBroadcast(method, payload) {
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
      "MEMBER_PORTAL_CRON_SECRET is not set on Gym Manager (must match Website).",
    );
    err.status = 503;
    err.code = "portal-cron-secret-missing";
    throw err;
  }

  const url = `${base}/api/member/push/broadcast`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    body: method === "POST" ? JSON.stringify(payload || {}) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err = new Error(
      data?.message || data?.error || `Website broadcast failed (${res.status})`,
    );
    err.status = res.status;
    err.code = data?.error || "broadcast-proxy-failed";
    err.detail = data;
    throw err;
  }
  return data || { ok: true };
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
}
