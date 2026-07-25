import { NextResponse } from "next/server";
import { proxyToBackend } from "@/lib/portal-verify/server";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "id-required" }, { status: 400 });
  }
  return proxyToBackend(
    req,
    `/api/portal-verifications/${encodeURIComponent(id)}/approve`,
  );
}
