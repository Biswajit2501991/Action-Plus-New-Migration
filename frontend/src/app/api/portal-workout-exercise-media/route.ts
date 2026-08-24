import { NextResponse } from "next/server";
import {
  MAX_WORKOUT_PLAN_VIDEO_BYTES,
  WORKOUT_PLAN_EXERCISES,
} from "@/lib/workout-plan-exercises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MEDIA_TABLE = "portal_workout_exercise_media";
const MEDIA_BUCKET = "website-media";

function resolveBackendBase() {
  let raw = String(process.env.API_PROXY_TARGET || "http://127.0.0.1:4000").trim();
  if (!raw) raw = "http://127.0.0.1:4000";
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw.replace(/^\/+/, "")}`;
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
  return { ok: true as const };
}

async function sbFetch(
  cfg: { url: string; key: string },
  path: string,
  init: RequestInit = {},
) {
  return fetch(`${cfg.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      Accept: "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
    cache: "no-store",
  });
}

type MediaRow = {
  gym_id?: string;
  exercise_key?: string;
  display_name?: string | null;
  mp4_url?: string | null;
  storage_path?: string | null;
  youtube_url?: string | null;
};

async function loadMediaRows(cfg: { url: string; key: string; gymId: string }) {
  const res = await sbFetch(
    cfg,
    `${MEDIA_TABLE}?gym_id=eq.${encodeURIComponent(cfg.gymId)}&select=exercise_key,display_name,mp4_url,storage_path,youtube_url`,
  );
  if (!res.ok) return [] as MediaRow[];
  const rows = (await res.json()) as MediaRow[];
  return Array.isArray(rows) ? rows : [];
}

function publicObjectUrl(cfg: { url: string }, storagePath: string) {
  return `${cfg.url}/storage/v1/object/public/${MEDIA_BUCKET}/${storagePath}`;
}

function catalogExercise(exerciseKey: string) {
  return WORKOUT_PLAN_EXERCISES.find((e) => e.exerciseKey === exerciseKey) || null;
}

async function upsertMediaRow(
  cfg: { url: string; key: string; gymId: string },
  row: Record<string, unknown>,
) {
  return sbFetch(cfg, `${MEDIA_TABLE}?on_conflict=gym_id,exercise_key`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
}

async function deleteStorageObject(cfg: { url: string; key: string }, storagePath: string) {
  await fetch(`${cfg.url}/storage/v1/object/${MEDIA_BUCKET}/${storagePath}`, {
    method: "DELETE",
    headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
  }).catch(() => null);
}

async function createSignedUpload(cfg: { url: string; key: string }, storagePath: string) {
  const res = await fetch(
    `${cfg.url}/storage/v1/object/upload/sign/${MEDIA_BUCKET}/${storagePath}`,
    {
      method: "POST",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ upsert: true }),
    },
  );
  const payload = (await res.json().catch(() => ({}))) as { url?: string; token?: string };
  if (!res.ok || !payload.url) {
    return { ok: false as const, message: JSON.stringify(payload) || `sign-failed (${res.status})` };
  }
  const uploadUrl = payload.url.startsWith("http")
    ? payload.url
    : `${cfg.url}/storage/v1${payload.url.startsWith("/") ? payload.url : `/${payload.url}`}`;
  return { ok: true as const, uploadUrl, token: payload.token || "" };
}

export async function GET(req: Request) {
  const auth = await requireStaff(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const cfg = supabaseConfig();
  if (!cfg) {
    return NextResponse.json({ ok: false, error: "supabase-unavailable" }, { status: 500 });
  }
  const rows = await loadMediaRows(cfg);
  const byKey = new Map(rows.map((r) => [String(r.exercise_key || ""), r]));
  const exercises = WORKOUT_PLAN_EXERCISES.map((ex) => {
    const row = byKey.get(ex.exerciseKey);
    return {
      exerciseKey: ex.exerciseKey,
      name: ex.name,
      mp4Url: String(row?.mp4_url || "").trim() || null,
      hasVideo: Boolean(String(row?.mp4_url || "").trim()),
    };
  });
  return NextResponse.json({ ok: true, exercises, maxBytes: MAX_WORKOUT_PLAN_VIDEO_BYTES });
}

export async function POST(req: Request) {
  const auth = await requireStaff(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const cfg = supabaseConfig();
  if (!cfg) {
    return NextResponse.json({ ok: false, error: "supabase-unavailable" }, { status: 500 });
  }

  const contentType = String(req.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("application/json")) {
    let body: { action?: string; exerciseKey?: string; storagePath?: string; fileSize?: number } = {};
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return NextResponse.json({ ok: false, error: "invalid-json" }, { status: 400 });
    }
    const exerciseKey = String(body.exerciseKey || "").trim();
    const catalog = catalogExercise(exerciseKey);
    if (!catalog) {
      return NextResponse.json({ ok: false, error: "unknown-exercise" }, { status: 400 });
    }
    const action = String(body.action || "").trim();
    if (action === "sign") {
      const fileSize = Number(body.fileSize || 0);
      if (fileSize > MAX_WORKOUT_PLAN_VIDEO_BYTES) {
        return NextResponse.json(
          { ok: false, error: "too-large", message: "Video must be 50 MB or smaller." },
          { status: 400 },
        );
      }
      const stamp = Date.now();
      const storagePath = `workout-plan/${cfg.gymId}/${exerciseKey}-${stamp}.mp4`;
      const signed = await createSignedUpload(cfg, storagePath);
      if (!signed.ok) {
        return NextResponse.json(
          { ok: false, error: "sign-failed", message: signed.message },
          { status: 500 },
        );
      }
      return NextResponse.json({
        ok: true,
        action: "sign",
        exerciseKey,
        storagePath,
        uploadUrl: signed.uploadUrl,
        token: signed.token,
      });
    }
    if (action === "commit") {
      const storagePath = String(body.storagePath || "").trim();
      const expectedPrefix = `workout-plan/${cfg.gymId}/${exerciseKey}-`;
      if (!storagePath.startsWith(expectedPrefix) || !storagePath.endsWith(".mp4")) {
        return NextResponse.json({ ok: false, error: "invalid-path" }, { status: 400 });
      }
      const existing = (await loadMediaRows(cfg)).find((r) => r.exercise_key === exerciseKey);
      const mp4Url = publicObjectUrl(cfg, storagePath);
      const save = await upsertMediaRow(cfg, {
        gym_id: cfg.gymId,
        exercise_key: exerciseKey,
        display_name: catalog.name,
        mp4_url: mp4Url,
        storage_path: storagePath,
        youtube_url: existing?.youtube_url || null,
        is_active: true,
        updated_at: new Date().toISOString(),
      });
      if (!save.ok) {
        const text = await save.text();
        return NextResponse.json(
          { ok: false, error: "save-failed", message: text || "save-failed" },
          { status: 500 },
        );
      }
      if (existing?.storage_path && existing.storage_path !== storagePath) {
        await deleteStorageObject(cfg, existing.storage_path);
      }
      return NextResponse.json({
        ok: true,
        exercise: { exerciseKey, name: catalog.name, mp4Url, hasVideo: true },
      });
    }
    return NextResponse.json({ ok: false, error: "unknown-action" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid-form" }, { status: 400 });
  }
  const exerciseKey = String(form.get("exerciseKey") || "").trim();
  const catalog = catalogExercise(exerciseKey);
  if (!catalog) {
    return NextResponse.json({ ok: false, error: "unknown-exercise" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ ok: false, error: "file-required" }, { status: 400 });
  }
  if (file.size > MAX_WORKOUT_PLAN_VIDEO_BYTES) {
    return NextResponse.json(
      { ok: false, error: "too-large", message: "Video must be 50 MB or smaller." },
      { status: 400 },
    );
  }
  const mime = String(file.type || "video/mp4").toLowerCase();
  if (mime && mime !== "video/mp4" && mime !== "video/quicktime") {
    return NextResponse.json(
      { ok: false, error: "invalid-type", message: "Upload an MP4 file." },
      { status: 400 },
    );
  }

  const existing = (await loadMediaRows(cfg)).find((r) => r.exercise_key === exerciseKey);
  const stamp = Date.now();
  const storagePath = `workout-plan/${cfg.gymId}/${exerciseKey}-${stamp}.mp4`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const upload = await fetch(
    `${cfg.url}/storage/v1/object/${MEDIA_BUCKET}/${storagePath}`,
    {
      method: "POST",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": mime || "video/mp4",
        "x-upsert": "true",
      },
      body: buffer,
    },
  );
  if (!upload.ok) {
    const text = await upload.text();
    return NextResponse.json(
      { ok: false, error: "upload-failed", message: text || `upload-failed (${upload.status})` },
      { status: 500 },
    );
  }

  if (existing?.storage_path && existing.storage_path !== storagePath) {
    await deleteStorageObject(cfg, existing.storage_path);
  }

  const mp4Url = publicObjectUrl(cfg, storagePath);
  const save = await upsertMediaRow(cfg, {
    gym_id: cfg.gymId,
    exercise_key: exerciseKey,
    display_name: catalog.name,
    mp4_url: mp4Url,
    storage_path: storagePath,
    youtube_url: existing?.youtube_url || null,
    is_active: true,
    updated_at: new Date().toISOString(),
  });
  if (!save.ok) {
    const text = await save.text();
    return NextResponse.json(
      { ok: false, error: "save-failed", message: text || "save-failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    exercise: { exerciseKey, name: catalog.name, mp4Url, hasVideo: true },
  });
}

export async function DELETE(req: Request) {
  const auth = await requireStaff(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const cfg = supabaseConfig();
  if (!cfg) {
    return NextResponse.json({ ok: false, error: "supabase-unavailable" }, { status: 500 });
  }
  const exerciseKey = new URL(req.url).searchParams.get("exerciseKey")?.trim() || "";
  if (!exerciseKey) {
    return NextResponse.json({ ok: false, error: "exercise-required" }, { status: 400 });
  }
  const existing = (await loadMediaRows(cfg)).find((r) => r.exercise_key === exerciseKey);
  if (existing?.storage_path) {
    await deleteStorageObject(cfg, existing.storage_path);
  }
  await sbFetch(
    cfg,
    `${MEDIA_TABLE}?gym_id=eq.${encodeURIComponent(cfg.gymId)}&exercise_key=eq.${encodeURIComponent(exerciseKey)}`,
    { method: "DELETE" },
  );
  return NextResponse.json({ ok: true, exerciseKey });
}
