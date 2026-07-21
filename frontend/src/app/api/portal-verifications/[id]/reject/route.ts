import { NextResponse } from "next/server";
import {
  authenticateViaBackend,
  createServiceSupabase,
  gymIdFromClaims,
  proxyToBackend,
} from "@/lib/portal-verify/server";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "id-required" }, { status: 400 });
  }

  // Clone body for possible fallback after proxy consumes the request stream.
  const rawBody = await req.text();
  const proxyReq = new Request(req.url, {
    method: "POST",
    headers: req.headers,
    body: rawBody || undefined,
  });

  const proxied = await proxyToBackend(
    proxyReq,
    `/api/portal-verifications/${encodeURIComponent(id)}/reject`,
  );
  if (proxied.status !== 404) return proxied;

  const authReq = new Request(req.url, {
    method: "POST",
    headers: req.headers,
    body: rawBody || undefined,
  });
  const auth = await authenticateViaBackend(authReq);
  if (!auth.ok) return auth.response;

  const sb = createServiceSupabase();
  if (!sb.ok) {
    return NextResponse.json({ error: sb.error }, { status: 500 });
  }

  let note = "";
  try {
    note = String((JSON.parse(rawBody || "{}") as { note?: string }).note || "")
      .trim()
      .slice(0, 200);
  } catch {
    note = "";
  }

  const gymId = gymIdFromClaims(auth.claims);
  const actor = auth.claims.name || auth.claims.userId || "staff";
  const now = new Date().toISOString();

  const { data, error } = await sb.client
    .from("member_portal_otp_challenges")
    .update({
      staff_status: "rejected",
      staff_rejected_at: now,
      staff_rejected_by: actor,
      staff_note: note || null,
    })
    .eq("id", id)
    .eq("gym_id", gymId)
    .eq("staff_status", "pending")
    .select("id, member_uuid")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: "not-found-or-already-handled" },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true });
}
