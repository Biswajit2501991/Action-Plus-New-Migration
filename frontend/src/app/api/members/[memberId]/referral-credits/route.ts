import { NextResponse } from "next/server";

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

async function loadMember(
  cfg: { url: string; key: string; gymId: string },
  memberId: string,
) {
  const key = String(memberId || "").trim();
  if (!key) return null;
  const byUuid = /^[0-9a-f-]{36}$/i.test(key);
  const filter = byUuid
    ? `member_uuid=eq.${encodeURIComponent(key)}`
    : `member_code=eq.${encodeURIComponent(key)}`;
  const res = await sbFetch(
    cfg,
    `members?gym_id=eq.${encodeURIComponent(cfg.gymId)}&${filter}&deleted_at=is.null&select=member_uuid,member_code&limit=1`,
  );
  const rows = (await res.json().catch(() => [])) as Array<{
    member_uuid?: string;
    member_code?: string;
  }>;
  return Array.isArray(rows) ? rows[0] || null : null;
}

type Ctx = { params: Promise<{ memberId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const auth = await requireStaff(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const { memberId } = await ctx.params;
  const cfg = supabaseConfig();
  if (!cfg) {
    const target = `${resolveBackendBase()}/api/members/${encodeURIComponent(memberId)}/referral-credits`;
    const headers: Record<string, string> = { Accept: "application/json" };
    const a = req.headers.get("authorization");
    if (a) headers.Authorization = a;
    const cookie = req.headers.get("cookie");
    if (cookie) headers.Cookie = cookie;
    try {
      const res = await fetch(target, { method: "GET", headers, cache: "no-store" });
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

  try {
    const member = await loadMember(cfg, memberId);
    if (!member?.member_uuid) {
      return NextResponse.json({ ok: false, error: "member-not-found" }, { status: 404 });
    }

    const pendingRes = await sbFetch(
      cfg,
      `member_referral_events?gym_id=eq.${encodeURIComponent(cfg.gymId)}&referrer_uuid=eq.${encodeURIComponent(member.member_uuid)}&referrer_credit_status=eq.pending&select=id,referrer_credit_inr,code_used,referred_uuid,created_at&order=created_at.asc`,
    );
    const pending = (await pendingRes.json().catch(() => [])) as Array<{
      id?: string;
      referrer_credit_inr?: number;
      code_used?: string;
      referred_uuid?: string;
      created_at?: string;
    }>;
    const list = Array.isArray(pending) ? pending : [];
    const pendingCreditInr = list.reduce(
      (sum, e) => sum + (Number(e.referrer_credit_inr) || 0),
      0,
    );

    const referredRes = await sbFetch(
      cfg,
      `member_referral_events?gym_id=eq.${encodeURIComponent(cfg.gymId)}&referred_uuid=eq.${encodeURIComponent(member.member_uuid)}&referrer_credit_status=neq.void&select=code_used,admission_discount_inr,referrer_uuid,created_at&order=created_at.desc&limit=1`,
    );
    const referredRows = (await referredRes.json().catch(() => [])) as Array<{
      code_used?: string;
      admission_discount_inr?: number;
      referrer_uuid?: string;
      created_at?: string;
    }>;
    const asReferred = Array.isArray(referredRows) ? referredRows[0] : null;

    return NextResponse.json({
      ok: true,
      memberUuid: member.member_uuid,
      memberCode: member.member_code,
      pendingCreditInr,
      pendingEvents: list.map((e) => ({
        id: e.id,
        creditInr: Number(e.referrer_credit_inr) || 0,
        codeUsed: e.code_used || null,
        referredUuid: e.referred_uuid || null,
        createdAt: e.created_at,
      })),
      referredBy: asReferred
        ? {
            code: asReferred.code_used || null,
            admissionDiscountInr: Number(asReferred.admission_discount_inr) || 0,
            referrerUuid: asReferred.referrer_uuid,
            createdAt: asReferred.created_at,
          }
        : null,
      source: "next-supabase",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "referral-credits-failed",
        message: err instanceof Error ? err.message : "referral-credits-failed",
      },
      { status: 500 },
    );
  }
}
