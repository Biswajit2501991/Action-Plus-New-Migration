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
) {
  return fetch(`${cfg.url}/rest/v1/${path}`, {
    method: "GET",
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
}

export async function GET(req: Request) {
  const auth = await requireStaff(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const url = new URL(req.url);
  const gymCodeId = String(url.searchParams.get("gymCodeId") || "").trim();
  const year = String(
    url.searchParams.get("yearSuffix") || String(new Date().getFullYear()).slice(-2),
  )
    .trim()
    .slice(-2);
  const token =
    String(url.searchParams.get("branchToken") || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "") || "BR";

  if (!gymCodeId) {
    return NextResponse.json(
      { ok: false, error: "gym-code-id-required" },
      { status: 400 },
    );
  }

  const cfg = supabaseConfig();
  if (!cfg) {
    const target = `${resolveBackendBase()}/api/members/next-form-number?${url.searchParams.toString()}`;
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
    const membersRes = await sbFetch(
      cfg,
      `members?gym_id=eq.${encodeURIComponent(cfg.gymId)}&assigned_gym_code_id=eq.${encodeURIComponent(gymCodeId)}&select=form_no,member_code&limit=5000`,
    );
    const rows = (await membersRes.json().catch(() => [])) as Array<{
      form_no?: number;
      member_code?: string;
    }>;

    const usedFormNos = new Set<number>();
    const usedCodes = new Set<string>();
    for (const row of Array.isArray(rows) ? rows : []) {
      const formNo = Number(row.form_no);
      if (Number.isFinite(formNo) && formNo > 0) usedFormNos.add(Math.floor(formNo));
      const code = String(row.member_code || "").trim();
      if (code) usedCodes.add(code);
      const m = code.match(/^APG-(\d+)\/(\d{2})-([A-Z0-9]+)$/i);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n > 0) usedFormNos.add(n);
      }
    }

    try {
      const auditRes = await sbFetch(
        cfg,
        `member_delete_audit?gym_id=eq.${encodeURIComponent(cfg.gymId)}&select=member_code&limit=5000`,
      );
      const audited = (await auditRes.json().catch(() => [])) as Array<{
        member_code?: string;
      }>;
      for (const row of Array.isArray(audited) ? audited : []) {
        const code = String(row.member_code || "").trim();
        if (code) usedCodes.add(code);
        const m = code.match(/^APG-(\d+)\/(\d{2})-([A-Z0-9]+)$/i);
        if (m) {
          const n = Number(m[1]);
          if (Number.isFinite(n) && n > 0) usedFormNos.add(n);
        }
      }
    } catch {
      /* optional */
    }

    let next = usedFormNos.size ? Math.max(...usedFormNos) + 1 : 1;
    for (let i = 0; i < 5000; i += 1) {
      const candidate = `APG-${next}/${year}-${token}`;
      if (!usedCodes.has(candidate) && !usedFormNos.has(next)) break;
      next += 1;
    }

    return NextResponse.json({
      ok: true,
      formNo: next,
      memberId: `APG-${next}/${year}-${token}`,
      gymCodeId,
      branchToken: token,
      yearSuffix: year,
      source: "next-supabase",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "next-form-number-failed",
        message: err instanceof Error ? err.message : "next-form-number-failed",
      },
      { status: 500 },
    );
  }
}
