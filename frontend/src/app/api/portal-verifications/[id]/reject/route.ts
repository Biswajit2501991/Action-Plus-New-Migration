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

  let note = "";
  try {
    const body = (await req.json()) as { note?: string };
    note = String(body?.note || "").trim().slice(0, 200);
  } catch {
    note = "";
  }

  const gymId = gymIdFromClaims(claims);
  const actor = claims.userId || "staff";
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
