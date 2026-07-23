import { NextResponse } from "next/server";
import {
  NEW_MEMBER_JOIN_DISCOUNT_INR,
  REFERRER_CREDIT_INR,
} from "@/lib/domain/referral-billing";

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

function normalizeCode(raw: string) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function isAllowedStatus(status: unknown) {
  const s = String(status || "").trim().toLowerCase();
  return s === "active" || s === "hold";
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
  const headers: Record<string, string> = {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  return fetch(`${cfg.url}/rest/v1/${path}`, { ...init, headers, cache: "no-store" });
}

async function proxyToBackend(req: Request, code: string) {
  const target = `${resolveBackendBase()}/api/referrals/lookup?code=${encodeURIComponent(code)}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  const auth = req.headers.get("authorization");
  if (auth) headers.Authorization = auth;
  const cookie = req.headers.get("cookie");
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(target, { method: "GET", headers, cache: "no-store" });
  const text = await res.text();
  return new NextResponse(text || null, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") || "application/json",
    },
  });
}

export async function GET(req: Request) {
  const auth = await requireStaff(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const code = normalizeCode(url.searchParams.get("code") || "");
  if (!code || code.length < 4) {
    return NextResponse.json(
      { ok: false, error: "invalid-referral-code" },
      { status: 400 },
    );
  }

  const cfg = supabaseConfig();
  if (!cfg) {
    // Fall back to Express when this Railway service has no Supabase secrets.
    try {
      return await proxyToBackend(req, code);
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

  try {
    // Exact match first, then case-insensitive filter.
    let codeRes = await sbFetch(
      cfg,
      `member_referral_codes?gym_id=eq.${encodeURIComponent(cfg.gymId)}&code=eq.${encodeURIComponent(code)}&select=code,points,member_uuid&limit=1`,
    );
    let rows = (await codeRes.json().catch(() => [])) as Array<{
      code?: string;
      points?: number;
      member_uuid?: string;
    }>;
    if (!Array.isArray(rows) || !rows[0]?.member_uuid) {
      codeRes = await sbFetch(
        cfg,
        `member_referral_codes?gym_id=eq.${encodeURIComponent(cfg.gymId)}&code=ilike.${encodeURIComponent(code)}&select=code,points,member_uuid&limit=5`,
      );
      rows = (await codeRes.json().catch(() => [])) as typeof rows;
    }
    const row = Array.isArray(rows)
      ? rows.find((r) => normalizeCode(String(r.code || "")) === code) || rows[0]
      : null;
    if (!row?.member_uuid) {
      return NextResponse.json(
        { ok: false, error: "referral-code-not-found" },
        { status: 404 },
      );
    }

    const memberRes = await sbFetch(
      cfg,
      `members?gym_id=eq.${encodeURIComponent(cfg.gymId)}&member_uuid=eq.${encodeURIComponent(row.member_uuid)}&deleted_at=is.null&select=member_uuid,member_code,full_name,status&limit=1`,
    );
    const members = (await memberRes.json().catch(() => [])) as Array<{
      member_uuid?: string;
      member_code?: string;
      full_name?: string;
      status?: string;
    }>;
    const member = Array.isArray(members) ? members[0] : null;
    if (!member?.member_uuid) {
      return NextResponse.json(
        { ok: false, error: "referral-code-not-found" },
        { status: 404 },
      );
    }
    if (!isAllowedStatus(member.status)) {
      return NextResponse.json(
        {
          ok: false,
          error: "referrer-not-eligible",
          detail: "Only Active or Hold members can refer.",
        },
        { status: 403 },
      );
    }

    return NextResponse.json({
      ok: true,
      code: normalizeCode(String(row.code || code)),
      points: Number(row.points || 0) || 0,
      referrer: {
        memberUuid: member.member_uuid,
        memberCode: member.member_code,
        fullName: member.full_name,
        status: member.status,
      },
      joinDiscountInr: NEW_MEMBER_JOIN_DISCOUNT_INR,
      referrerCreditInr: REFERRER_CREDIT_INR,
      source: "next-supabase",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "referral-lookup-failed",
        message: err instanceof Error ? err.message : "referral-lookup-failed",
      },
      { status: 500 },
    );
  }
}
