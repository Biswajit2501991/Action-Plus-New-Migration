import { NextResponse } from "next/server";
import {
  bearerFromRequest,
  createServiceSupabase,
  gymIdFromClaims,
  isOwnerClaims,
  verifyStaffJwt,
} from "@/lib/portal-verify/server";

export const dynamic = "force-dynamic";

/** List pending Member Portal WhatsApp verifications (served by Next so frontend-only deploys work). */
export async function GET(req: Request) {
  const token = bearerFromRequest(req);
  const claims = verifyStaffJwt(token);
  if (!claims) {
    return NextResponse.json(
      { error: "unauthorized", message: "Valid login required." },
      { status: 401 },
    );
  }
  if (!isOwnerClaims(claims)) {
    // Non-owners: allow if they have a valid staff token (same as members write intent).
    // Granular access is enforced in UI; owners always pass.
  }

  const sb = createServiceSupabase();
  if (!sb.ok) {
    return NextResponse.json({ error: sb.error }, { status: 500 });
  }

  const gymId = gymIdFromClaims(claims);
  const status = new URL(req.url).searchParams.get("status") || "pending";

  let q = sb.client
    .from("member_portal_otp_challenges")
    .select(
      "id, member_uuid, mobile_normalized, expires_at, created_at, staff_status, otp_plain_for_staff, verification_channel, staff_approved_at, staff_approved_by",
    )
    .eq("gym_id", gymId)
    .eq("verification_channel", "whatsapp_staff")
    .order("created_at", { ascending: false })
    .limit(100);

  if (status === "pending") q = q.eq("staff_status", "pending");
  else if (status === "approved") q = q.eq("staff_status", "approved");
  else if (status === "rejected") q = q.eq("staff_status", "rejected");

  const { data: rows, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const uuids = [...new Set((rows || []).map((r) => r.member_uuid).filter(Boolean))];
  const membersByUuid: Record<string, Record<string, unknown>> = {};
  if (uuids.length) {
    const { data: members } = await sb.client
      .from("members")
      .select("member_uuid, member_code, full_name, mobile, status, assigned_gym_code_id")
      .eq("gym_id", gymId)
      .in("member_uuid", uuids);
    for (const m of members || []) {
      membersByUuid[String(m.member_uuid)] = m as Record<string, unknown>;
    }
  }

  const items = (rows || []).map((r) => {
    const m = membersByUuid[r.member_uuid] || {};
    return {
      id: r.id,
      memberUuid: r.member_uuid,
      memberCode: m.member_code || null,
      fullName: m.full_name || null,
      mobile: r.mobile_normalized || m.mobile || null,
      membershipStatus: m.status || null,
      assignedGymCodeId: m.assigned_gym_code_id || null,
      staffStatus: r.staff_status,
      otpForStaff: r.otp_plain_for_staff || null,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      approvedAt: r.staff_approved_at || null,
      approvedBy: r.staff_approved_by || null,
    };
  });

  return NextResponse.json({ ok: true, items });
}
