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

  const proxied = await proxyToBackend(
    req,
    `/api/portal-verifications/${encodeURIComponent(id)}/approve`,
  );
  if (proxied.status !== 404) return proxied;

  const auth = await authenticateViaBackend(req);
  if (!auth.ok) return auth.response;

  const sb = createServiceSupabase();
  if (!sb.ok) {
    return NextResponse.json({ error: sb.error }, { status: 500 });
  }

  const gymId = gymIdFromClaims(auth.claims);
  const actor = auth.claims.name || auth.claims.userId || "staff";
  const now = new Date().toISOString();

  const { data, error } = await sb.client
    .from("member_portal_otp_challenges")
    .update({
      staff_status: "approved",
      staff_approved_at: now,
      staff_approved_by: actor,
      consumed_at: now,
    })
    .eq("id", id)
    .eq("gym_id", gymId)
    .eq("staff_status", "pending")
    .select("id, member_uuid, mobile_normalized")
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
