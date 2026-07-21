import { createHmac, timingSafeEqual } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type StaffClaims = {
  userId: string;
  roles?: string[];
  staffRole?: string;
  gymId?: string;
  permissions?: string[];
};

function b64urlDecode(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function verifyStaffJwt(token: string): StaffClaims | null {
  try {
    const secret = String(process.env.JWT_SECRET || "").trim();
    if (!secret || !token) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const data = `${header}.${body}`;
    const expected = createHmac("sha256", secret).update(data).digest();
    const actual = b64urlDecode(sig);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return null;
    }
    const payload = JSON.parse(b64urlDecode(body).toString("utf8")) as StaffClaims & {
      exp?: number;
    };
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.userId) return null;
    return payload;
  } catch {
    return null;
  }
}

export function isOwnerClaims(claims: StaffClaims) {
  const id = String(claims.userId || "").toLowerCase();
  const role = String(claims.staffRole || "").toLowerCase();
  const roles = Array.isArray(claims.roles) ? claims.roles.map((r) => String(r).toLowerCase()) : [];
  return (
    id === "owner" ||
    role === "master_owner" ||
    role === "owner" ||
    roles.includes("owner") ||
    (claims.permissions || []).includes("*")
  );
}

export function gymIdFromClaims(claims: StaffClaims) {
  return (
    String(claims.gymId || "").trim() ||
    String(process.env.APG_GYM_ID || process.env.NEXT_PUBLIC_GYM_ID || "").trim() ||
    "48815df4-6144-40dd-bbd6-91fd8522d1ff"
  );
}

export function createServiceSupabase():
  | { ok: true; client: SupabaseClient }
  | { ok: false; error: string } {
  const url = String(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  ).trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) {
    return {
      ok: false,
      error:
        "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY on the frontend Railway service.",
    };
  }
  return {
    ok: true,
    client: createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

export function bearerFromRequest(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : "";
}
