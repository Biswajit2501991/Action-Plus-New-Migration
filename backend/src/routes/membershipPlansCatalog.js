/**
 * Membership plan catalog — showcase metadata for staff sales talk.
 * Branch-scoped: each gym_code_id owns its own catalog rows.
 * Does not rewrite members.amount, payments, or settings.plans name list.
 * Not exposed to Member Portal.
 */

import { Access } from "../auth/accessControl.js";
import { resolveReadBranchScope } from "../auth/branchScope.js";
import { requireAccess } from "../middleware/permissions.js";
import { filterLookupRowsForGymCodeId } from "../db/supabase/settingsLookupBranchId.js";
import {
  normalizeExplainLanguage,
  translatePlanExplainFields,
} from "../services/membershipPlanExplainTranslate.js";

const DETAILS_MAX = 8000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeInclusions(input) {
  if (!Array.isArray(input)) {
    if (typeof input === "string") {
      return input
        .split("\n")
        .map((s) => s.replace(/^[-•*\s]+/, "").trim())
        .filter(Boolean)
        .slice(0, 40);
    }
    return [];
  }
  return input
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .slice(0, 40);
}

function normalizeDetails(raw) {
  return String(raw || "").trim().slice(0, DETAILS_MAX);
}

function normalizePlanName(raw) {
  return String(raw || "").trim().slice(0, 80);
}

function catalogSaveErrorMessage(err) {
  const msg = String(err?.message || err || "");
  if (/no unique or exclusion constraint matching the ON CONFLICT/i.test(msg)) {
    return "Could not save this plan (database conflict key). Please try again.";
  }
  if (/duplicate key|unique constraint/i.test(msg)) {
    return "A catalog row for this plan name already exists on this branch. Refresh and try again.";
  }
  if (/violates check constraint.*details/i.test(msg)) {
    return `Plan details are too long (max ${DETAILS_MAX} characters).`;
  }
  if (/violates check constraint.*tagline/i.test(msg)) {
    return "Tagline is too long (max 200 characters).";
  }
  if (/permission|rls|row-level/i.test(msg)) {
    return "You do not have permission to save plan details.";
  }
  return msg || "Could not save plan details.";
}

function rowToPlan(row, fallbackName, index = 0) {
  const name = normalizePlanName(row?.plan_name || fallbackName);
  const priceRaw = row?.list_price_inr;
  const price =
    priceRaw == null || priceRaw === ""
      ? null
      : Number.isFinite(Number(priceRaw))
        ? Number(priceRaw)
        : null;
  return {
    planName: name,
    gymCodeId: row?.gym_code_id ? String(row.gym_code_id) : null,
    listPriceInr: price,
    tagline: String(row?.tagline || "").slice(0, 200),
    details: String(row?.details || ""),
    inclusions: normalizeInclusions(row?.inclusions),
    isEnabled: row?.is_enabled !== false,
    sortOrder: Number.isFinite(Number(row?.sort_order))
      ? Number(row.sort_order)
      : index,
    hasCatalogRow: Boolean(row?.id),
    updatedAt: row?.updated_at || null,
  };
}

/**
 * Active branch for catalog reads/writes.
 * Staff: locked to JWT branch. Owner: active branch (must select one).
 */
function resolveCatalogBranchId(req) {
  const scope = resolveReadBranchScope(req.auth);
  if (scope?.staffNoBranch) {
    const err = new Error("branch-scope-missing");
    err.status = 403;
    err.message = "Your profile has no gym branch assigned.";
    throw err;
  }
  const fromScope = String(scope?.gymCodeId || "").trim();
  if (fromScope && UUID_RE.test(fromScope)) return fromScope;

  const fromAuth = String(
    req.auth?.activeBranchId || req.auth?.gymCodeId || "",
  ).trim();
  if (fromAuth && UUID_RE.test(fromAuth)) return fromAuth;

  const err = new Error("gym-code-id-required");
  err.status = 400;
  err.message =
    "Select a gym branch to view or edit that branch’s membership plans.";
  throw err;
}

async function loadBranchMeta(sb, gid, gymCodeId) {
  const { data, error } = await sb
    .from("gym_codes")
    .select("id, code, name")
    .eq("gym_id", gid)
    .eq("id", gymCodeId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) {
    const err = new Error("branch-not-found");
    err.status = 404;
    err.message = "That gym branch was not found.";
    throw err;
  }
  return {
    gymCodeId: String(data.id),
    gymCode: String(data.code || ""),
    branchName: String(data.name || ""),
    branchLabel:
      data.code && data.name
        ? `${data.name} (${data.code})`
        : String(data.name || data.code || ""),
  };
}

async function loadPlanNames(sb, gid, gymCodeId) {
  const { data, error } = await sb
    .from("settings_lookup_values")
    .select("value, sort_order, is_active, created_by_gym_code_id")
    .eq("gym_id", gid)
    .eq("category", "plans")
    .order("sort_order", { ascending: true });
  if (error) {
    const msg = String(error.message || "");
    if (!/relation|does not exist|schema cache|created_by_gym_code_id/i.test(msg)) {
      throw error;
    }
    if (/created_by_gym_code_id/i.test(msg)) {
      const retry = await sb
        .from("settings_lookup_values")
        .select("value, sort_order, is_active")
        .eq("gym_id", gid)
        .eq("category", "plans")
        .order("sort_order", { ascending: true });
      if (retry.error) throw retry.error;
      return normalizePlanNameList(retry.data);
    }
    return [];
  }
  const scoped = filterLookupRowsForGymCodeId(data || [], gymCodeId);
  return normalizePlanNameList(scoped);
}

function normalizePlanNameList(rows) {
  const names = [];
  const seen = new Set();
  for (const row of rows || []) {
    if (row?.is_active === false) continue;
    const name = normalizePlanName(row.value);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

async function loadMasterEnabled(sb, gid) {
  const { data } = await sb
    .from("settings_app_config")
    .select("config_json")
    .eq("gym_id", gid)
    .maybeSingle();
  const cfg =
    data?.config_json && typeof data.config_json === "object"
      ? data.config_json
      : {};
  return cfg.membershipPlansCatalogEnabled !== false;
}

async function saveMasterEnabled(sb, gid, enabled) {
  const { data: existing } = await sb
    .from("settings_app_config")
    .select("*")
    .eq("gym_id", gid)
    .maybeSingle();
  const liveCfg =
    existing?.config_json && typeof existing.config_json === "object"
      ? { ...existing.config_json }
      : {};
  liveCfg.membershipPlansCatalogEnabled = Boolean(enabled);
  const row = {
    gym_id: gid,
    fine_sms_enabled: existing?.fine_sms_enabled !== false,
    fine_sms_grace_days: Number(existing?.fine_sms_grace_days || 0),
    fine_sms_immediate_roles_json: existing?.fine_sms_immediate_roles_json || [],
    finance_use_estimated_expense: existing?.finance_use_estimated_expense !== false,
    config_json: liveCfg,
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb
    .from("settings_app_config")
    .upsert(row, { onConflict: "gym_id" });
  if (error) throw error;
  return liveCfg.membershipPlansCatalogEnabled;
}

/** Prefer update/insert over upsert — avoids PostgREST ON CONFLICT constraint-name issues. */
async function saveCatalogRow(sb, gid, gymCodeId, upsertRow) {
  const { data: existing, error: findErr } = await sb
    .from("membership_plan_catalog")
    .select("id, list_price_inr, details, tagline, inclusions, is_enabled, sort_order")
    .eq("gym_id", gid)
    .eq("gym_code_id", gymCodeId)
    .eq("plan_name", upsertRow.plan_name)
    .maybeSingle();
  if (findErr) throw findErr;

  if (existing?.id) {
    const patch = { ...upsertRow };
    delete patch.gym_id;
    delete patch.gym_code_id;
    delete patch.plan_name;
    if (upsertRow.list_price_inr === undefined) {
      patch.list_price_inr = existing.list_price_inr;
    }
    const { data, error } = await sb
      .from("membership_plan_catalog")
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  const { data, error } = await sb
    .from("membership_plan_catalog")
    .insert(upsertRow)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function registerMembershipPlansCatalogRoutes(app, { appendAuditLog } = {}) {
  app.get(
    "/api/membership-plans-catalog",
    requireAccess(Access.membershipPlansCatalogRead),
    async (req, res) => {
      try {
        const { getSupabase, gymId } = await import("../db/supabase/client.js");
        const sb = getSupabase();
        const gid = gymId() || req.auth?.gymId;
        if (!sb || !gid) {
          return res.status(500).json({ error: "supabase-unavailable" });
        }

        let gymCodeId;
        try {
          gymCodeId = resolveCatalogBranchId(req);
        } catch (err) {
          return res.status(err.status || 400).json({
            error: err.message === "branch-scope-missing"
              ? "branch-scope-missing"
              : "gym-code-id-required",
            message: err.message,
            plans: [],
            masterEnabled: true,
            branchRequired: true,
          });
        }

        const [planNames, masterEnabled, branchMeta, catalogRes] = await Promise.all([
          loadPlanNames(sb, gid, gymCodeId),
          loadMasterEnabled(sb, gid),
          loadBranchMeta(sb, gid, gymCodeId),
          sb
            .from("membership_plan_catalog")
            .select("*")
            .eq("gym_id", gid)
            .eq("gym_code_id", gymCodeId)
            .order("sort_order", { ascending: true }),
        ]);

        if (catalogRes.error) {
          const msg = String(catalogRes.error.message || "");
          if (!/relation|does not exist|schema cache/i.test(msg)) {
            return res.status(500).json({
              error: "catalog-load-failed",
              message: catalogRes.error.message,
            });
          }
        }

        const byName = new Map();
        for (const row of catalogRes.data || []) {
          const key = normalizePlanName(row.plan_name).toLowerCase();
          if (key) byName.set(key, row);
        }

        const mergedNames = [...planNames];
        for (const row of catalogRes.data || []) {
          const name = normalizePlanName(row.plan_name);
          if (!name) continue;
          if (!mergedNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
            mergedNames.push(name);
          }
        }

        const plans = mergedNames.map((name, index) => {
          const row = byName.get(name.toLowerCase()) || null;
          return rowToPlan(row || { gym_code_id: gymCodeId }, name, index);
        });

        return res.json({
          ok: true,
          masterEnabled,
          gymCodeId: branchMeta.gymCodeId,
          branchName: branchMeta.branchName,
          gymCode: branchMeta.gymCode,
          branchLabel: branchMeta.branchLabel,
          plans,
        });
      } catch (err) {
        return res.status(err.status || 500).json({
          error: "load-failed",
          message: err?.message || "Could not load membership plans.",
        });
      }
    },
  );

  app.put(
    "/api/membership-plans-catalog",
    requireAccess(Access.membershipPlansCatalogWrite),
    async (req, res) => {
      try {
        const { getSupabase, gymId } = await import("../db/supabase/client.js");
        const sb = getSupabase();
        const gid = gymId() || req.auth?.gymId;
        if (!sb || !gid) {
          return res.status(500).json({
            error: "supabase-unavailable",
            message: "Database is unavailable. Try again in a moment.",
          });
        }

        let gymCodeId;
        try {
          gymCodeId = resolveCatalogBranchId(req);
        } catch (err) {
          return res.status(err.status || 400).json({
            error: err.message === "branch-scope-missing"
              ? "branch-scope-missing"
              : "gym-code-id-required",
            message: err.message,
          });
        }

        await loadBranchMeta(sb, gid, gymCodeId);

        const planName = normalizePlanName(req.body?.planName || req.body?.plan_name);
        if (!planName) {
          return res.status(400).json({
            error: "plan-name-required",
            message: "Plan name is required.",
          });
        }

        const inclusions = normalizeInclusions(req.body?.inclusions);
        const details = normalizeDetails(req.body?.details);
        const tagline = String(req.body?.tagline || "").trim().slice(0, 200);
        const isEnabled =
          req.body?.isEnabled !== undefined
            ? Boolean(req.body.isEnabled)
            : req.body?.is_enabled !== undefined
              ? Boolean(req.body.is_enabled)
              : true;
        const sortOrder = Number.isFinite(Number(req.body?.sortOrder ?? req.body?.sort_order))
          ? Math.floor(Number(req.body?.sortOrder ?? req.body?.sort_order))
          : 0;

        let listPriceInr;
        const priceProvided =
          req.body?.listPriceInr !== undefined
          || req.body?.list_price_inr !== undefined;
        if (priceProvided) {
          const raw = req.body?.listPriceInr ?? req.body?.list_price_inr;
          if (raw === null || raw === "") listPriceInr = null;
          else {
            const n = Number(raw);
            if (!Number.isFinite(n) || n < 0) {
              return res.status(400).json({
                error: "invalid-price",
                message: "List price must be a number of 0 or more.",
              });
            }
            listPriceInr = Math.round(n * 100) / 100;
          }
        }

        const actor = String(req.auth?.userId || "staff").trim().slice(0, 120);
        const upsertRow = {
          gym_id: gid,
          gym_code_id: gymCodeId,
          plan_name: planName,
          tagline,
          details,
          inclusions,
          is_enabled: isEnabled,
          sort_order: sortOrder,
          updated_by: actor,
          updated_at: new Date().toISOString(),
        };
        if (priceProvided) upsertRow.list_price_inr = listPriceInr;

        const data = await saveCatalogRow(sb, gid, gymCodeId, upsertRow);

        if (typeof appendAuditLog === "function") {
          await appendAuditLog(req, {
            action: "membership_plans.catalog.updated",
            entityType: "membership_plan_catalog",
            entityId: `${gymCodeId}:${planName}`,
            after: {
              planName,
              gymCodeId,
              listPriceInr: data?.list_price_inr,
              isEnabled: data?.is_enabled !== false,
              hasDetails: Boolean(String(data?.details || "").trim()),
            },
          });
        }

        return res.json({ ok: true, plan: rowToPlan(data, planName), gymCodeId });
      } catch (err) {
        return res.status(err.status || 500).json({
          error: "save-failed",
          message: catalogSaveErrorMessage(err),
        });
      }
    },
  );

  app.patch(
    "/api/membership-plans-catalog/master",
    requireAccess(Access.membershipPlansCatalogWrite),
    async (req, res) => {
      try {
        const { getSupabase, gymId } = await import("../db/supabase/client.js");
        const sb = getSupabase();
        const gid = gymId() || req.auth?.gymId;
        if (!sb || !gid) {
          return res.status(500).json({
            error: "supabase-unavailable",
            message: "Database is unavailable. Try again in a moment.",
          });
        }

        if (req.body?.enabled === undefined && req.body?.masterEnabled === undefined) {
          return res.status(400).json({
            error: "enabled-required",
            message: "enabled is required.",
          });
        }
        const enabled = Boolean(
          req.body?.enabled !== undefined
            ? req.body.enabled
            : req.body.masterEnabled,
        );
        const masterEnabled = await saveMasterEnabled(sb, gid, enabled);

        if (typeof appendAuditLog === "function") {
          await appendAuditLog(req, {
            action: "membership_plans.catalog.master",
            entityType: "membership_plan_catalog",
            entityId: "master",
            after: { masterEnabled },
          });
        }

        return res.json({ ok: true, masterEnabled });
      } catch (err) {
        return res.status(500).json({
          error: "save-failed",
          message: catalogSaveErrorMessage(err),
        });
      }
    },
  );

  /**
   * Display-only explain helper. Does not write catalog or members.
   */
  app.post(
    "/api/membership-plans-catalog/explain-translate",
    requireAccess(Access.membershipPlansCatalogRead),
    async (req, res) => {
      try {
        const language = normalizeExplainLanguage(req.body?.language);
        if (!language) {
          return res.status(400).json({
            error: "language-required",
            message: "Choose Hindi, Bengali, Hinglish, or Original.",
          });
        }
        if (language === "original") {
          return res.json({
            ok: true,
            language: "original",
            tagline: String(req.body?.tagline || ""),
            details: String(req.body?.details || ""),
            inclusions: Array.isArray(req.body?.inclusions)
              ? req.body.inclusions.map((s) => String(s || ""))
              : [],
            provider: "none",
          });
        }

        const tagline = String(req.body?.tagline || "").slice(0, 200);
        const details = String(req.body?.details || "").slice(0, 8000);
        const inclusions = Array.isArray(req.body?.inclusions)
          ? req.body.inclusions.map((s) => String(s || "").slice(0, 200)).slice(0, 40)
          : [];

        if (!tagline.trim() && !details.trim() && !inclusions.some((s) => s.trim())) {
          return res.status(400).json({
            error: "text-required",
            message: "Nothing to translate on this plan yet.",
          });
        }

        const translated = await translatePlanExplainFields({
          language,
          tagline,
          details,
          inclusions,
        });
        return res.json({ ok: true, ...translated });
      } catch (err) {
        return res.status(err.status || 502).json({
          error: "translate-failed",
          message:
            err?.message ||
            "Could not translate right now. Showing original text.",
        });
      }
    },
  );
}
