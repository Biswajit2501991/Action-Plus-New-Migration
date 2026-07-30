import { NextResponse } from "next/server";
import {
  DEFAULT_BASIC_WORKOUT_OPTIONS,
  DEFAULT_PORTAL_SECTIONS,
  encodeHomeTilesIntoWorkoutOptions,
  homeTilesBitToken,
  hydratePortalSettingsFromApi,
  mergePortalSections,
  normalizePortalSections,
  splitWorkoutOptionsAndHomeTiles,
} from "@/lib/member-portal-ui-config";
import {
  DEFAULT_PORTAL_ACCESS_BY_STATUS,
  normalizePortalAccessByStatus,
  type PortalAccessByStatus,
} from "@/lib/member-portal-access-by-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveBackendBase() {
  let raw = String(process.env.API_PROXY_TARGET || "http://127.0.0.1:4000").trim();
  if (!raw) raw = "http://127.0.0.1:4000";
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw.replace(/^\/+/, "")}`;
  }
  return raw.replace(/\/+$/, "");
}

function supabaseConfig() {
  const url = String(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  )
    .trim()
    .replace(/\/+$/, "");
  const key = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "",
  ).trim();
  const gymId = String(process.env.APG_GYM_ID || "").trim();
  if (!url || !key || !gymId) return null;
  return { url, key, gymId };
}

async function requireStaff(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const cookie = req.headers.get("cookie") || "";
  if (!auth && !cookie) {
    return { ok: false as const, status: 401, error: "unauthorized" };
  }
  const res = await fetch(`${resolveBackendBase()}/api/auth/me`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(auth ? { Authorization: auth } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    return { ok: false as const, status: res.status || 401, error: "unauthorized" };
  }
  const data = (await res.json().catch(() => ({}))) as { user?: { gymId?: string } };
  return { ok: true as const, user: data.user || null };
}

async function sbFetch(
  cfg: { url: string; key: string },
  path: string,
  init: RequestInit = {},
) {
  const headers: Record<string, string> = {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  return fetch(`${cfg.url}/rest/v1/${path}`, { ...init, headers, cache: "no-store" });
}

async function loadRow(cfg: { url: string; key: string; gymId: string }) {
  const res = await sbFetch(
    cfg,
    `member_portal_settings?gym_id=eq.${encodeURIComponent(cfg.gymId)}&select=*`,
    { method: "GET" },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `load-failed (${res.status})`);
  }
  const rows = (await res.json()) as Array<Record<string, unknown>>;
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function loadExerciseTypeMarkers(cfg: {
  url: string;
  key: string;
  gymId: string;
}): Promise<string[]> {
  const res = await sbFetch(
    cfg,
    `settings_lookup_values?gym_id=eq.${encodeURIComponent(cfg.gymId)}&category=eq.exerciseTypes&is_active=eq.true&select=value`,
    { method: "GET" },
  );
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<{ value?: string }>;
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => String(r.value || "").trim()).filter(Boolean);
}

/** Persist home-tile bits as a durable exerciseTypes marker (works without Express portal routes). */
async function persistHomeTileMarker(
  cfg: { url: string; key: string; gymId: string },
  sections: ReturnType<typeof normalizePortalSections>,
) {
  const token = homeTilesBitToken(sections);
  const existing = await loadExerciseTypeMarkers(cfg);
  const stale = existing.filter((v) => v.startsWith("__pht__:") && v !== token);
  for (const value of stale) {
    await sbFetch(
      cfg,
      `settings_lookup_values?gym_id=eq.${encodeURIComponent(cfg.gymId)}&category=eq.exerciseTypes&value=eq.${encodeURIComponent(value)}`,
      { method: "DELETE" },
    );
  }
  if (existing.includes(token)) return;

  // Prefer an existing exerciseTypes branch owner so unique indexes stay happy.
  const branchRes = await sbFetch(
    cfg,
    `settings_lookup_values?gym_id=eq.${encodeURIComponent(cfg.gymId)}&category=eq.exerciseTypes&is_active=eq.true&select=created_by_gym_code_id&limit=1`,
    { method: "GET" },
  );
  let branchId: string | null = null;
  if (branchRes.ok) {
    const rows = (await branchRes.json()) as Array<{ created_by_gym_code_id?: string }>;
    branchId = String(rows?.[0]?.created_by_gym_code_id || "").trim() || null;
  }
  if (!branchId) {
    const codesRes = await sbFetch(
      cfg,
      `gym_codes?gym_id=eq.${encodeURIComponent(cfg.gymId)}&select=id&order=code.asc&limit=1`,
      { method: "GET" },
    );
    if (codesRes.ok) {
      const codes = (await codesRes.json()) as Array<{ id?: string }>;
      branchId = String(codes?.[0]?.id || "").trim() || null;
    }
  }

  const insertBody: Record<string, unknown> = {
    gym_id: cfg.gymId,
    category: "exerciseTypes",
    value: token,
    sort_order: 9990,
    is_active: true,
    created_by_role: "owner",
  };
  if (branchId) insertBody.created_by_gym_code_id = branchId;

  const insertRes = await sbFetch(cfg, "settings_lookup_values", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(insertBody),
  });
  if (!insertRes.ok) {
    const text = await insertRes.text();
    throw new Error(text || `home-tile-marker-save-failed (${insertRes.status})`);
  }
}

async function syncMembersPortalAccessByStatus(
  cfg: { url: string; key: string; gymId: string },
  accessByStatus: PortalAccessByStatus,
) {
  const map = normalizePortalAccessByStatus(accessByStatus);
  const results: Record<string, { allowed: boolean; updated: number }> = {};

  async function patchMembers(filter: string, body: Record<string, unknown>) {
    const res = await sbFetch(
      cfg,
      `members?gym_id=eq.${encodeURIComponent(cfg.gymId)}&${filter}&deleted_at=is.null`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `portal-access-sync-failed (${res.status})`);
    }
    const rows = (await res.json().catch(() => [])) as unknown[];
    return Array.isArray(rows) ? rows.length : 0;
  }

  for (const [statusKey, allowed] of Object.entries(map)) {
    const now = new Date().toISOString();
    // Case-insensitive status match (Active/active/ACTIVE).
    const statusFilter = `status=ilike.${encodeURIComponent(statusKey)}`;
    if (allowed) {
      const withPin = await patchMembers(
        `${statusFilter}&portal_status=eq.disabled&pin_hash=not.is.null`,
        {
          portal_enabled: true,
          portal_status: "active",
          updated_at: now,
        },
      );
      const noPin = await patchMembers(
        `${statusFilter}&portal_status=eq.disabled&pin_hash=is.null`,
        {
          portal_enabled: true,
          portal_status: "pending",
          updated_at: now,
        },
      );
      const others = await patchMembers(
        `${statusFilter}&portal_status=neq.disabled`,
        { portal_enabled: true, updated_at: now },
      );
      results[statusKey] = {
        allowed: true,
        updated: withPin + noPin + others,
      };
    } else {
      const updated = await patchMembers(statusFilter, {
        portal_enabled: false,
        portal_status: "disabled",
        updated_at: now,
      });
      results[statusKey] = { allowed: false, updated };
    }
  }
  return results;
}

function publicSettingsPayload(
  row: Record<string, unknown> | null,
  exerciseTypes?: string[],
) {
  const hydrated = hydratePortalSettingsFromApi({
    basic_workout_options: row?.basic_workout_options as never,
    portal_sections: row?.portal_sections as never,
    exerciseTypes,
  });
  return {
    ok: true,
    settings: {
      ...(row || {}),
      gym_id: row?.gym_id,
      basic_workout_options: hydrated.workoutOptions,
      portal_sections: hydrated.portalSections,
      portal_access_by_status: normalizePortalAccessByStatus(
        row?.portal_access_by_status ?? DEFAULT_PORTAL_ACCESS_BY_STATUS,
      ),
      auth_method: row?.auth_method || "whatsapp_staff",
      chat_retention_days: row?.chat_retention_days ?? 7,
    },
    source: "next-supabase",
  };
}

export async function GET(req: Request) {
  const auth = await requireStaff(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const cfg = supabaseConfig();
  if (!cfg) {
    // Fall back to Express if this Railway service has no Supabase secrets.
    return proxyPortalSettings(req);
  }

  try {
    const [row, exerciseTypes] = await Promise.all([
      loadRow(cfg),
      loadExerciseTypeMarkers(cfg),
    ]);
    return NextResponse.json(publicSettingsPayload(row, exerciseTypes));
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "load-failed",
        message: err instanceof Error ? err.message : "load-failed",
      },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const auth = await requireStaff(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const cfg = supabaseConfig();
  if (!cfg) {
    return proxyPortalSettings(req);
  }

  let body: {
    basic_workout_options?: unknown;
    portal_sections?: unknown;
    portal_access_by_status?: unknown;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid-json" }, { status: 400 });
  }

  try {
    const existing = await loadRow(cfg);
    const payloadSections = normalizePortalSections(
      body.portal_sections !== undefined
        ? body.portal_sections
        : existing?.portal_sections,
    );
    const workoutIncoming =
      body.basic_workout_options !== undefined
        ? body.basic_workout_options
        : splitWorkoutOptionsAndHomeTiles(existing?.basic_workout_options).workoutOptions;
    const workoutClean = splitWorkoutOptionsAndHomeTiles(workoutIncoming).workoutOptions;
    const basicWorkoutOptions = encodeHomeTilesIntoWorkoutOptions(
      workoutClean.length ? workoutClean : DEFAULT_BASIC_WORKOUT_OPTIONS,
      payloadSections,
    );
    const portalSections = mergePortalSections(
      payloadSections,
      mergePortalSections(existing?.portal_sections, DEFAULT_PORTAL_SECTIONS),
    );
    const previousAccess = normalizePortalAccessByStatus(
      existing?.portal_access_by_status ?? DEFAULT_PORTAL_ACCESS_BY_STATUS,
    );
    const portalAccessByStatus = normalizePortalAccessByStatus(
      body.portal_access_by_status !== undefined
        ? body.portal_access_by_status
        : previousAccess,
    );
    // Bulk-sync only when the status policy actually changed — never on tile-only saves.
    const accessChanged =
      JSON.stringify(previousAccess) !== JSON.stringify(portalAccessByStatus);

    const row = {
      gym_id: cfg.gymId,
      billing_push_enabled: Boolean(existing?.billing_push_enabled ?? true),
      billing_push_title: String(existing?.billing_push_title || "Billing reminder").slice(
        0,
        120,
      ),
      billing_push_body: String(
        existing?.billing_push_body ||
          "Your membership billing date is today. Please renew at the gym.",
      ).slice(0, 500),
      billing_match_field:
        existing?.billing_match_field === "billing_date"
          ? "billing_date"
          : "next_payment_date",
      chat_retention_days: Number(existing?.chat_retention_days ?? 7) || 7,
      auth_method:
        existing?.auth_method === "auto_identity" ? "auto_identity" : "whatsapp_staff",
      basic_workout_options: basicWorkoutOptions,
      portal_sections: portalSections,
      portal_access_by_status: portalAccessByStatus,
      updated_at: new Date().toISOString(),
    };

    const res = await sbFetch(
      cfg,
      `member_portal_settings?on_conflict=gym_id`,
      {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(row),
    },
    );
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { ok: false, error: "save-failed", message: text || `save-failed (${res.status})` },
        { status: 500 },
      );
    }
    const savedRows = (await res.json()) as Array<Record<string, unknown>>;
    const saved = Array.isArray(savedRows) && savedRows[0] ? savedRows[0] : row;
    await persistHomeTileMarker(cfg, portalSections);
    let syncResults: Record<string, { allowed: boolean; updated: number }> | null = null;
    if (accessChanged) {
      syncResults = await syncMembersPortalAccessByStatus(cfg, portalAccessByStatus);
    }
    const exerciseTypes = await loadExerciseTypeMarkers(cfg);
    return NextResponse.json({
      ...publicSettingsPayload(saved as Record<string, unknown>, exerciseTypes),
      syncResults,
      accessChanged,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "save-failed",
        message: err instanceof Error ? err.message : "save-failed",
      },
      { status: 500 },
    );
  }
}

async function proxyPortalSettings(req: Request) {
  const target = `${resolveBackendBase()}/api/portal-settings`;
  const headers: Record<string, string> = { Accept: "application/json" };
  const auth = req.headers.get("authorization");
  if (auth) headers.Authorization = auth;
  const cookie = req.headers.get("cookie");
  if (cookie) headers.Cookie = cookie;
  const contentType = req.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  const init: RequestInit = { method: req.method, headers, cache: "no-store" };
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      const body = await req.text();
      if (body) init.body = body;
    } catch {
      /* no body */
    }
  }
  try {
    const res = await fetch(target, init);
    const text = await res.text();
    return new NextResponse(text || null, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") || "application/json",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "backend-unreachable",
        message: err instanceof Error ? err.message : "backend-unreachable",
      },
      { status: 502 },
    );
  }
}
