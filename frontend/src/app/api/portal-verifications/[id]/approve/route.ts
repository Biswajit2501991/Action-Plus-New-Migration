import { NextResponse } from "next/server";
import {
  bearerFromRequest,
  createServiceSupabase,
  gymIdFromClaims,
  verifyStaffJwt,
} from "@/lib/portal-verify/server";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const token = bearerFromRequest(req);
  const claims = verifyStaffJwt(token);
  if (!claims) {
    return NextResponse.json(
      { error: "unauthorized", message: "Valid login required." },
      { status: 401 },
    );
  }

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "id-required" }, { status: 400 });
  }

  const sb = createServiceSupabase();
  if (!sb.ok) {
    return NextResponse.json({ error: sb.error }, { status: 500 });
  }

  const gymId = gymIdFromClaims(claims);
  const actor = claims.userId || "staff";
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
