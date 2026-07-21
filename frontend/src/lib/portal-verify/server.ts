import { NextResponse } from "next/server";

function resolveBackendBase() {
  let raw = String(process.env.API_PROXY_TARGET || "http://127.0.0.1:4000").trim();
  if (!raw) raw = "http://127.0.0.1:4000";
  if (!/^https?:\/\//i.test(raw)) {
    raw = `https://${raw.replace(/^\/+/, "")}`;
  }
  return raw.replace(/\/+$/, "");
}

/** Forward WhatsApp Verification requests to Express (owns JWT + Supabase). */
export async function proxyToBackend(req: Request, backendPath: string) {
  const target = `${resolveBackendBase()}${backendPath.startsWith("/") ? backendPath : `/${backendPath}`}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const auth = req.headers.get("authorization");
  if (auth) headers.Authorization = auth;
  const cookie = req.headers.get("cookie");
  if (cookie) headers.Cookie = cookie;
  const contentType = req.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: "no-store",
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      const body = await req.text();
      if (body) init.body = body;
    } catch {
      // no body
    }
  }

  try {
    const res = await fetch(target, init);
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
        error: "backend-unreachable",
        message:
          err instanceof Error
            ? `API_PROXY_TARGET unreachable: ${err.message}`
            : "API_PROXY_TARGET unreachable",
      },
      { status: 502 },
    );
  }
}
