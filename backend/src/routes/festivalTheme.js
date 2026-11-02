/**
 * Festival theme catalog stored on website_settings.
 * GET: any signed-in staff. PATCH: master owner only.
 * Does not touch members, payments, portal auth, or WhatsApp.
 */

import { Router } from "express";
import { requireMasterOwner } from "../middleware/requireMasterOwner.js";
import { useSupabase } from "../db/dataStore.js";
import { getSupabase, gymId } from "../db/supabase/client.js";
import {
  applyLegacyMirror,
  emptyFestivalCatalog,
  festivalWindowError,
  hydrateFestivalCatalog,
  overlappingFestivalError,
  resolveLiveFestivalTheme,
} from "../lib/festivalTheme.js";

const router = Router();

function failClosed(res, extra = {}) {
  return res.json({
    ok: true,
    catalog: emptyFestivalCatalog(),
    live: null,
    ...extra,
  });
}

async function readSettingsRow() {
  if (!useSupabase()) return null;
  const { data, error } = await getSupabase()
    .from("website_settings")
    .select(
      "festival_enabled, festival_theme, festival_starts_at, festival_ends_at, festival_catalog",
    )
    .eq("gym_id", gymId())
    .maybeSingle();
  if (error) throw error;
  return data;
}

router.get("/", async (_req, res) => {
  try {
    const row = await readSettingsRow();
    if (!row) return failClosed(res);
    const catalog = hydrateFestivalCatalog(row);
    return res.json({
      ok: true,
      catalog,
      live: resolveLiveFestivalTheme(catalog, "gym_manager"),
    });
  } catch (err) {
    console.error("[festival-theme] read failed:", err?.message || err);
    return failClosed(res);
  }
});

router.patch("/", requireMasterOwner, async (req, res) => {
  try {
    if (!useSupabase()) {
      return res.status(503).json({
        ok: false,
        error: "festival-unavailable",
        message: "Festival themes need the connected gym database.",
      });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const theme = String(body.theme || "").trim();
    const row = await readSettingsRow();
    if (!row) {
      return res.status(404).json({
        ok: false,
        error: "settings-missing",
        message: "Website settings were not found.",
      });
    }
    const catalog = hydrateFestivalCatalog(row);

    if (theme === "" || theme === "default") {
      catalog.durga_puja.enabled = false;
      catalog.diwali.enabled = false;
      catalog.chhath_puja.enabled = false;
      catalog.new_year_2027.enabled = false;
      catalog.holi_2027.enabled = false;
      const mirror = applyLegacyMirror(catalog);
      const { error } = await getSupabase()
        .from("website_settings")
        .update({
          festival_catalog: catalog,
          ...mirror,
          updated_at: new Date().toISOString(),
        })
        .eq("gym_id", gymId());
      if (error) throw error;
      return res.json({
        ok: true,
        catalog,
        live: resolveLiveFestivalTheme(catalog, "gym_manager"),
      });
    }

    if (
      theme !== "durga_puja" &&
      theme !== "diwali" &&
      theme !== "chhath_puja" &&
      theme !== "new_year_2027" &&
      theme !== "holi_2027"
    ) {
      return res.status(400).json({
        ok: false,
        error: "unknown-theme",
        message: "Unknown theme.",
      });
    }

    const enabled = Boolean(body.enabled);
    const starts_at = String(body.starts_at || "").trim() || null;
    const ends_at = String(body.ends_at || "").trim() || null;
    const apply_website = body.apply_website !== false;
    const apply_gym_manager = Boolean(body.apply_gym_manager);
    const next = {
      enabled,
      starts_at,
      ends_at,
      apply_website,
      apply_gym_manager,
    };

    const windowErr = festivalWindowError(enabled, starts_at || "", ends_at || "");
    if (windowErr) {
      return res.status(400).json({ ok: false, error: "invalid-window", message: windowErr });
    }
    if (!apply_website && !apply_gym_manager) {
      return res.status(400).json({
        ok: false,
        error: "apply-required",
        message: "Choose where this theme applies: website, Gym Manager, or both.",
      });
    }
    const overlap = overlappingFestivalError(catalog, theme, next);
    if (overlap) {
      return res.status(400).json({ ok: false, error: "schedule-overlap", message: overlap });
    }

    catalog[theme] = next;
    const mirror = applyLegacyMirror(catalog);
    const { error } = await getSupabase()
      .from("website_settings")
      .update({
        festival_catalog: catalog,
        ...mirror,
        updated_at: new Date().toISOString(),
      })
      .eq("gym_id", gymId());
    if (error) throw error;
    return res.json({
      ok: true,
      catalog,
      live: resolveLiveFestivalTheme(catalog, "gym_manager"),
    });
  } catch (err) {
    console.error("[festival-theme] save failed:", err?.message || err);
    return res.status(500).json({
      ok: false,
      error: "festival-save-failed",
      message: "Could not save the festival theme.",
    });
  }
});

export default router;
