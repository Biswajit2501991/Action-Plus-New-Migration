import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export type StaffClaims = {
  userId: string;
  roles?: string[];
  staffRole?: string;
  gymId?: string;
  permissions?: string[];
  name?: string;
};

function resolveBackendBase() {
  let raw = String(process.env.API_PROXY_TARGET || "http://127.0.0.1:4000").trim();
  if (!raw) raw = "http://127.0.0.1:4000";
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw.replace(/^\/+/, "")}`;
  }
  return raw.replace(/\/+$/, "");
}

export function bearerFromRequest(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : "";
}

/** Forward the browser request to Express (correct JWT_SECRET). */
export async function proxyToBackend(req: Request, backendPath: string) {
  const target = `${resolveBackendBase()}${backendPath.startsWith("/") ? backendPath : `/${backendPath}`}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const auth = req.headers.get("authorization");
  if (auth) headers.Authorization = auth;
  const cookie = req.headers.get("cookie");
  if (cookie) headers.Cookie = cookie;
  const contentType = req.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: "no-store",
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    const body = await req.text();
    if (body) init.body = body;
  }

  const res = await fetch(target, init);
  const text = await res.text();
  return new NextResponse(text || null, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") || "application/json",
    },
  });
}

/**
 * Validate staff session via Express /api/auth/me (no JWT_SECRET needed on Next).
 * Returns null only when the token is actually invalid — missing config returns an error response.
 */
export async function authenticateViaBackend(
  req: Request,
): Promise<
  | { ok: true; claims: StaffClaims }
  | { ok: false; response: NextResponse }
> {
  const token = bearerFromRequest(req);
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "unauthorized", message: "Valid login required." },
        { status: 401 },
      ),
    };
  }

  try {
    const res = await fetch(`${resolveBackendBase()}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      const body = await res.json().catch(() => ({ error: "unauthorized" }));
      return {
        ok: false,
        response: NextResponse.json(body, { status: res.status }),
      };
    }
    if (!res.ok) {
      // Do NOT return 401 — that clears the browser session via apiFetch.
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "auth-check-failed",
            message: `Could not verify session with backend (${res.status}).`,
          },
          { status: 502 },
        ),
      };
    }
    const data = (await res.json()) as {
      userId?: string;
      gymId?: string | null;
      staffRole?: string;
      user?: { id?: string; name?: string; staffRole?: string; roles?: string[] };
    };
    const userId = String(data.userId || data.user?.id || "").trim();
    if (!userId) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "unauthorized", message: "Valid login required." },
          { status: 401 },
        ),
      };
    }
    return {
      ok: true,
      claims: {
        userId,
        gymId: data.gymId || undefined,
        staffRole: data.staffRole || data.user?.staffRole,
        roles: data.user?.roles,
        name: data.user?.name,
        permissions:
          String(data.staffRole || data.user?.staffRole || "").toLowerCase() ===
            "master_owner" || userId.toLowerCase() === "owner"
            ? ["*"]
            : [],
      },
    };
  } catch (err) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "auth-check-failed",
          message:
            err instanceof Error
              ? err.message
              : "Could not reach auth backend.",
        },
        { status: 502 },
      ),
    };
  }
}

export function gymIdFromClaims(claims: StaffClaims) {
  return (
    String(claims.gymId || "").trim() ||
    String(process.env.APG_GYM_ID || process.env.NEXT_PUBLIC_GYM_ID || "").trim() ||
    "48815df4-6144-40dd-bbd6-91fd8522d1ff"
  );
}

export function createServiceSupabase():
  | { ok: true; client: SupabaseClient }
  | { ok: false; error: string } {
  const url = String(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  ).trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) {
    return {
      ok: false,
      error:
        "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY on the frontend Railway service.",
    };
  }
  return {
    ok: true,
    client: createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}
