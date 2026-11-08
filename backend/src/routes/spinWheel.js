/**
 * Spin & Win routes.
 * Public website spins do not use a staff session.
 * Member Portal spins arrive from the website with the shared secret.
 */

import express from "express";
import { isOwnerAuth } from "../middleware/requireOwner.js";
import { Access, getStaffAccessForUser } from "../auth/accessControl.js";
import { requireAccess } from "../middleware/permissions.js";
import { cronSecretMatches } from "../services/staffPush/staffPushSecret.js";
import {
  getSpinCampaign,
  livePayload,
  lookupSpinCoupon,
  publicSpinConfig,
  redeemSpinCoupon,
  saveSpinCampaign,
  spinReport,
  spinWheel,
} from "../services/spinWheel/spinWheelService.js";

const publicSpinWheelRouter = express.Router();

publicSpinWheelRouter.get("/config", async (req, res) => {
  try {
    const surface = String(req.query?.surface || "website");
    if (surface !== "website" && surface !== "member_portal" && surface !== "gym_manager") {
      return res.json({ ok: true, active: false });
    }
    const payload = await publicSpinConfig({
      surface,
      branchId: String(req.query?.branchId || "").trim(),
      audienceKind: surface === "member_portal" ? "member" : surface === "website" ? "visitor" : "staff",
    });
    return res.json(payload);
  } catch (err) {
    console.error("spin config failed", err?.message || err);
    return res.json({ ok: true, active: false });
  }
});

const publicSpinHits = new Map();

publicSpinWheelRouter.post("/spin", async (req, res) => {
  try {
    const ip = String(req.headers["x-forwarded-for"] || req.ip || "local").split(",")[0].trim() || "local";
    if (!allowPublicSpin(ip)) {
      return res.status(429).json({ error: "slow-down" });
    }
    const visitorKey = String(req.body?.visitorKey || "").trim();
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(visitorKey)) {
      return res.status(400).json({ error: "missing-person" });
    }
    const result = await spinWheel({
      surface: "website",
      audienceKind: "visitor",
      branchId: String(req.body?.branchId || "").trim(),
      participantKey: `visitor:${visitorKey}`,
    });
    return res.status(result.ok ? 200 : result.status || 400).json(result);
  } catch (err) {
    console.error("public spin failed", err?.message || err);
    return res.status(500).json({ error: "spin-failed" });
  }
});

export async function registerSpinWheelRoutes(app, { appendAuditLog } = {}) {
  app.get("/api/spin-wheel/campaign", requireSpinAdmin, async (req, res) => {
    try {
      const campaign = await getSpinCampaign({ create: true });
      return res.json({ ok: true, campaign });
    } catch (err) {
      return res.status(500).json({ error: "spin-load-failed", message: err?.message || "Could not load the wheel." });
    }
  });

  app.put("/api/spin-wheel/campaign", requireSpinAdmin, async (req, res) => {
    try {
      const saved = await saveSpinCampaign(req.body || {});
      if (!saved.ok) {
        return res.status(saved.status || 400).json({
          ...saved,
          message: (saved.errors || []).join(" "),
        });
      }
      if (typeof appendAuditLog === "function") {
        await appendAuditLog(req, {
          action: "spin.settings.updated",
          entityType: "spin_campaign",
          entityId: saved.campaign.id,
          after: { enabled: saved.campaign.enabled },
        });
      }
      return res.json(saved);
    } catch (err) {
      return res.status(500).json({ error: "spin-save-failed", message: err?.message || "Could not save the wheel." });
    }
  });

  app.get("/api/spin-wheel/live", async (req, res) => {
    try {
      const campaign = await getSpinCampaign();
      return res.json(
        livePayload(campaign, {
          surface: "gym_manager",
          branchId: String(req.auth?.activeBranchId || "").trim(),
          audienceKind: "staff",
        }),
      );
    } catch (err) {
      console.error("spin live failed", err?.message || err);
      return res.json({ ok: true, active: false });
    }
  });

  app.post("/api/spin-wheel/spin", async (req, res) => {
    try {
      const result = await spinWheel({
        surface: "gym_manager",
        audienceKind: "staff",
        branchId: String(req.auth?.activeBranchId || "").trim(),
        participantKey: `staff:${String(req.auth?.userId || "").trim()}`,
      });
      return res.status(result.ok ? 200 : result.status || 400).json(result);
    } catch (err) {
      console.error("staff spin failed", err?.message || err);
      return res.status(500).json({ error: "spin-failed" });
    }
  });

  app.get("/api/spin-wheel/report", requireSpinAdmin, async (req, res) => {
    try {
      const report = await spinReport({
        from: cleanBound(req.query?.from, false),
        to: cleanBound(req.query?.to, true),
        branchId: String(req.query?.branchId || "").trim(),
      });
      return res.json(report);
    } catch (err) {
      return res.status(500).json({ error: "spin-report-failed", message: err?.message || "Could not load the report." });
    }
  });

  app.get("/api/spin-wheel/lookup", requireAccess(Access.membersRead), async (req, res) => {
    try {
      const found = await lookupSpinCoupon(req.query?.code);
      if (!found.ok) {
        return res.status(found.status || 400).json({
          ...found,
          message: found.error === "not-found" ? "Code not found." : "This Spin code cannot be used.",
        });
      }
      return res.json({
        ok: true,
        coupon: {
          code: found.coupon.code,
          discount: found.coupon.discount,
          status: found.coupon.status,
          expiresAt: found.coupon.expiresAt,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: "spin-lookup-failed" });
    }
  });

  app.post("/api/spin-wheel/redeem-admission", requireAccess(Access.membersWrite), async (req, res) => {
    try {
      const result = await redeemSpinCoupon(req.body?.code, req.auth?.userId);
      if (result.ok && typeof appendAuditLog === "function") {
        await appendAuditLog(req, {
          action: "spin.coupon.redeemed",
          entityType: "spin_coupon",
          entityId: result.coupon.code,
          after: { discount: result.coupon.discount, source: "admission" },
        });
      }
      return res.status(result.ok ? 200 : result.status || 400).json(result);
    } catch (err) {
      return res.status(500).json({ error: "spin-redeem-failed" });
    }
  });

  app.get("/api/spin-wheel/coupons/:code", requireSpinAdmin, async (req, res) => {
    try {
      const found = await lookupSpinCoupon(req.params.code);
      return res.status(found.ok ? 200 : found.status || 400).json(found);
    } catch (err) {
      return res.status(500).json({ error: "spin-lookup-failed" });
    }
  });

  app.post("/api/spin-wheel/redeem", requireSpinAdmin, async (req, res) => {
    try {
      const result = await redeemSpinCoupon(req.body?.code, req.auth?.userId);
      if (result.ok && typeof appendAuditLog === "function") {
        await appendAuditLog(req, {
          action: "spin.coupon.redeemed",
          entityType: "spin_coupon",
          entityId: result.coupon.code,
          after: { discount: result.coupon.discount },
        });
      }
      return res.status(result.ok ? 200 : result.status || 400).json(result);
    } catch (err) {
      return res.status(500).json({ error: "spin-redeem-failed" });
    }
  });

  app.post("/api/internal/spin-wheel/spin", async (req, res) => {
    if (!cronSecretMatches(req)) return res.status(401).json({ error: "unauthorized" });
    try {
      const memberUuid = String(req.body?.memberUuid || "").trim();
      if (!memberUuid) return res.status(400).json({ error: "missing-person" });
      const result = await spinWheel({
        surface: "member_portal",
        audienceKind: "member",
        memberUuid,
        memberCode: String(req.body?.memberCode || "").trim(),
        branchId: String(req.body?.branchId || "").trim(),
        planName: String(req.body?.planName || "").trim(),
        participantKey: `member:${memberUuid}`,
      });
      return res.status(result.ok ? 200 : result.status || 400).json(result);
    } catch (err) {
      console.error("portal spin failed", err?.message || err);
      return res.status(500).json({ error: "spin-failed" });
    }
  });
}

async function requireSpinAdmin(req, res, next) {
  try {
    if (isOwnerAuth(req.auth)) return next();
    const access = req.staffAccess || (await getStaffAccessForUser(req.auth?.userId));
    req.staffAccess = access;
    if (access?.__owner || access?.settings?.manageSystemFeatures === true) return next();
    return res.status(403).json({ error: "forbidden" });
  } catch (err) {
    return res.status(500).json({ error: "forbidden", message: err?.message || "Could not check access." });
  }
}

function allowPublicSpin(ip) {
  const now = Date.now();
  const recent = (publicSpinHits.get(ip) || []).filter((at) => now - at < 60 * 60 * 1000);
  if (recent.length >= 8) {
    publicSpinHits.set(ip, recent);
    return false;
  }
  recent.push(now);
  publicSpinHits.set(ip, recent);
  return true;
}

function cleanBound(value, endOfDay) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  return endOfDay ? `${raw}T23:59:59.999Z` : `${raw}T00:00:00.000Z`;
}

export default publicSpinWheelRouter;
