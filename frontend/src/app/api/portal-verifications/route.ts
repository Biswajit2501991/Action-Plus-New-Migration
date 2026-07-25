import { proxyToBackend } from "@/lib/portal-verify/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  return proxyToBackend(req, `/api/portal-verifications${url.search}`);
}
