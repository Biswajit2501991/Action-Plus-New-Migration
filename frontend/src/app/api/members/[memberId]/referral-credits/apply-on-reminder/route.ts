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
    Prefer: "return=representation",
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
    `members?gym_id=eq.${encodeURIComponent(cfg.gymId)}&${filter}&deleted_at=is.null&select=id,member_uuid,member_code&limit=1`,
  );
  const rows = (await res.json().catch(() => [])) as Array<{
    id?: number;
    member_uuid?: string;
    member_code?: string;
  }>;
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function proxyApply(req: Request, memberId: string) {
  const target = `${resolveBackendBase()}/api/members/${encodeURIComponent(memberId)}/referral-credits/apply-on-reminder`;
  const headers: Record<string, string> = { Accept: "application/json" };
  const auth = req.headers.get("authorization");
  if (auth) headers.Authorization = auth;
  const cookie = req.headers.get("cookie");
  if (cookie) headers.Cookie = cookie;
  const contentType = req.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;
  try {
    const body = await req.text();
    const res = await fetch(target, {
      method: "POST",
      headers,
      body: body || undefined,
      cache: "no-store",
    });
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

type Ctx = { params: Promise<{ memberId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const auth = await requireStaff(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const { memberId } = await ctx.params;
  const cfg = supabaseConfig();
  if (!cfg) return proxyApply(req, memberId);

  try {
    let templateKey = "reminder";
    try {
      const body = (await req.json()) as { templateKey?: string };
      templateKey = String(body?.templateKey || "reminder").trim() || "reminder";
    } catch {
      templateKey = "reminder";
    }

    const member = await loadMember(cfg, memberId);
    if (!member?.member_uuid) {
      return NextResponse.json({ ok: false, error: "member-not-found" }, { status: 404 });
    }

    const pendingRes = await sbFetch(
      cfg,
      `member_referral_events?gym_id=eq.${encodeURIComponent(cfg.gymId)}&referrer_uuid=eq.${encodeURIComponent(member.member_uuid)}&referrer_credit_status=eq.pending&select=id,referrer_credit_inr`,
    );
    const pending = (await pendingRes.json().catch(() => [])) as Array<{
      id?: string;
      referrer_credit_inr?: number;
    }>;
    const list = Array.isArray(pending) ? pending : [];
    if (!list.length) {
      return NextResponse.json({
        ok: true,
        appliedCreditInr: 0,
        appliedEventIds: [],
        memberUuid: member.member_uuid,
        memberCode: member.member_code,
        source: "next-supabase",
      });
    }

    const ids = list.map((e) => e.id).filter(Boolean) as string[];
    const appliedCreditInr = list.reduce(
      (sum, e) => sum + (Number(e.referrer_credit_inr) || 0),
      0,
    );
    const now = new Date().toISOString();
    const note = `Referral credit ₹${appliedCreditInr} applied via billing reminder (${templateKey})${member.member_code ? ` (${member.member_code})` : ""}`;
    const idFilter = ids.map((id) => encodeURIComponent(id)).join(",");
    const upd = await sbFetch(
      cfg,
      `member_referral_events?gym_id=eq.${encodeURIComponent(cfg.gymId)}&referrer_uuid=eq.${encodeURIComponent(member.member_uuid)}&referrer_credit_status=eq.pending&id=in.(${idFilter})`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({
          referrer_credit_status: "applied",
          applied_at: now,
          note,
        }),
      },
    );
    if (!upd.ok) {
      const detail = await upd.text().catch(() => "");
      return NextResponse.json(
        {
          ok: false,
          error: "referral-credits-apply-failed",
          message: detail || `status ${upd.status}`,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      appliedCreditInr,
      appliedEventIds: ids,
      memberUuid: member.member_uuid,
      memberCode: member.member_code,
      source: "next-supabase",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "referral-credits-apply-failed",
        message: err instanceof Error ? err.message : "referral-credits-apply-failed",
      },
      { status: 500 },
    );
  }
}
