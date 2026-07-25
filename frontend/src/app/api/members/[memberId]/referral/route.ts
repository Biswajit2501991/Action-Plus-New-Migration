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
    `members?gym_id=eq.${encodeURIComponent(cfg.gymId)}&${filter}&deleted_at=is.null&select=id,member_uuid,member_code,full_name,status&limit=1`,
  );
  const rows = (await res.json().catch(() => [])) as Array<{
    id?: number;
    member_uuid?: string;
    member_code?: string;
    full_name?: string;
    status?: string;
  }>;
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function lookupCode(cfg: { url: string; key: string; gymId: string }, code: string) {
  let res = await sbFetch(
    cfg,
    `member_referral_codes?gym_id=eq.${encodeURIComponent(cfg.gymId)}&code=eq.${encodeURIComponent(code)}&select=code,points,member_uuid&limit=1`,
  );
  let rows = (await res.json().catch(() => [])) as Array<{
    code?: string;
    points?: number;
    member_uuid?: string;
  }>;
  if (!rows?.[0]?.member_uuid) {
    res = await sbFetch(
      cfg,
      `member_referral_codes?gym_id=eq.${encodeURIComponent(cfg.gymId)}&code=ilike.${encodeURIComponent(code)}&select=code,points,member_uuid&limit=5`,
    );
    rows = (await res.json().catch(() => [])) as typeof rows;
  }
  const row = (rows || []).find((r) => normalizeCode(String(r.code || "")) === code) || rows?.[0];
  if (!row?.member_uuid) return null;
  const referrer = await loadMember(cfg, row.member_uuid);
  if (!referrer || !isAllowedStatus(referrer.status)) return null;
  return {
    code: normalizeCode(String(row.code || code)),
    points: Number(row.points || 0) || 0,
    referrer,
  };
}

type Ctx = { params: Promise<{ memberId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const auth = await requireStaff(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  const { memberId } = await ctx.params;
  const cfg = supabaseConfig();
  if (!cfg) {
    return proxyApply(req, memberId);
  }

  let body: { code?: string } = {};
  try {
    body = (await req.json()) as { code?: string };
  } catch {
    body = {};
  }
  const code = normalizeCode(body.code || "");
  if (!code) {
    return NextResponse.json({ ok: false, error: "invalid-referral-code" }, { status: 400 });
  }

  try {
    const referred = await loadMember(cfg, memberId);
    if (!referred?.member_uuid) {
      return NextResponse.json({ ok: false, error: "member-not-found" }, { status: 404 });
    }
    if (!isAllowedStatus(referred.status)) {
      return NextResponse.json(
        { ok: false, error: "referred-member-not-eligible" },
        { status: 403 },
      );
    }

    const found = await lookupCode(cfg, code);
    if (!found?.referrer?.member_uuid) {
      return NextResponse.json(
        { ok: false, error: "referral-code-not-found" },
        { status: 404 },
      );
    }
    if (found.referrer.member_uuid === referred.member_uuid) {
      return NextResponse.json(
        { ok: false, error: "self-referral-not-allowed" },
        { status: 400 },
      );
    }

    const existingRes = await sbFetch(
      cfg,
      `member_referral_events?gym_id=eq.${encodeURIComponent(cfg.gymId)}&referred_uuid=eq.${encodeURIComponent(referred.member_uuid)}&referrer_credit_status=neq.void&select=id&limit=1`,
    );
    const existing = (await existingRes.json().catch(() => [])) as Array<{ id?: string }>;
    if (existing?.[0]?.id) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        eventId: existing[0].id,
        referrerCreditInr: REFERRER_CREDIT_INR,
        admissionDiscountInr: NEW_MEMBER_JOIN_DISCOUNT_INR,
        referrer: {
          memberUuid: found.referrer.member_uuid,
          memberCode: found.referrer.member_code,
          fullName: found.referrer.full_name,
          status: found.referrer.status,
        },
        code: found.code,
      });
    }

    const note = `Referral ${found.code}: +₹${REFERRER_CREDIT_INR} pending for ${found.referrer.member_code}; join collect −₹${NEW_MEMBER_JOIN_DISCOUNT_INR} for ${referred.member_code}`;
    const insertRes = await sbFetch(cfg, "member_referral_events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gym_id: cfg.gymId,
        referrer_uuid: found.referrer.member_uuid,
        referred_uuid: referred.member_uuid,
        points: REFERRER_CREDIT_INR,
        note,
        code_used: found.code,
        referrer_credit_inr: REFERRER_CREDIT_INR,
        admission_discount_inr: NEW_MEMBER_JOIN_DISCOUNT_INR,
        referrer_credit_status: "pending",
      }),
    });
    if (!insertRes.ok) {
      const text = await insertRes.text();
      if (/member_referral_events_gym_referred_active_uidx|duplicate key/i.test(text)) {
        return NextResponse.json({
          ok: true,
          duplicate: true,
          referrerCreditInr: REFERRER_CREDIT_INR,
          admissionDiscountInr: NEW_MEMBER_JOIN_DISCOUNT_INR,
          referrer: {
            memberCode: found.referrer.member_code,
            fullName: found.referrer.full_name,
          },
          code: found.code,
        });
      }
      return NextResponse.json(
        { ok: false, error: "referral-apply-failed", message: text },
        { status: 500 },
      );
    }
    const inserted = (await insertRes.json().catch(() => [])) as Array<{ id?: string }>;
    const nextPoints = found.points + REFERRER_CREDIT_INR;
    await sbFetch(
      cfg,
      `member_referral_codes?gym_id=eq.${encodeURIComponent(cfg.gymId)}&member_uuid=eq.${encodeURIComponent(found.referrer.member_uuid)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ points: nextPoints }),
      },
    );

    return NextResponse.json(
      {
        ok: true,
        duplicate: false,
        eventId: inserted?.[0]?.id || null,
        referrerCreditInr: REFERRER_CREDIT_INR,
        admissionDiscountInr: NEW_MEMBER_JOIN_DISCOUNT_INR,
        referrer: {
          memberUuid: found.referrer.member_uuid,
          memberCode: found.referrer.member_code,
          fullName: found.referrer.full_name,
          status: found.referrer.status,
        },
        code: found.code,
        points: nextPoints,
        source: "next-supabase",
      },
      { status: 201 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "referral-apply-failed",
        message: err instanceof Error ? err.message : "referral-apply-failed",
      },
      { status: 500 },
    );
  }
}

async function proxyApply(req: Request, memberId: string) {
  const target = `${resolveBackendBase()}/api/members/${encodeURIComponent(memberId)}/referral`;
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
