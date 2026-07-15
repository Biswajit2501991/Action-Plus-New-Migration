"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { storePresenceTicket } from "@/lib/attendance-presence";

type ClaimState = "working" | "ok" | "error";

function AttendanceClaimInner() {
  const search = useSearchParams();
  const token = String(search.get("t") || "").trim();
  const [state, setState] = useState<ClaimState>("working");
  const [message, setMessage] = useState("Confirming gym presence…");

  useEffect(() => {
    let cancelled = false;
    async function redeem() {
      if (!token) {
        setState("error");
        setMessage("Missing attendance QR token. Scan the gym display again.");
        return;
      }
      try {
        const res = await fetch("/api/public/attendance/presence/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          presenceTicket?: string;
          gymCodeId?: string;
          expiresAt?: string;
          message?: string;
          error?: string;
        };
        if (!res.ok || !data.presenceTicket) {
          if (cancelled) return;
          setState("error");
          setMessage(data.message || data.error || "QR expired or invalid. Scan again.");
          return;
        }
        storePresenceTicket({
          ticket: data.presenceTicket,
          gymCodeId: data.gymCodeId,
          expiresAt: data.expiresAt,
        });
        if (cancelled) return;
        setState("ok");
        setMessage("Presence confirmed. Log in within a few minutes to mark Time In.");
      } catch {
        if (cancelled) return;
        setState("error");
        setMessage("Network error. Check connection and scan again.");
      }
    }
    void redeem();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-16 text-slate-100">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/80 p-6 text-center shadow-2xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-300/80">
          Attendance
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Gym presence</h1>
        <p
          className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${
            state === "ok"
              ? "border-teal-500/30 bg-teal-500/10 text-teal-100"
              : state === "error"
                ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
                : "border-white/10 bg-white/5 text-slate-300"
          }`}
        >
          {message}
        </p>
        {state !== "working" ? (
          <Link
            href="/login"
            className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-teal-400 text-sm font-semibold text-slate-950 hover:bg-teal-300"
          >
            Continue to login
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export default function AttendanceClaimPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
          Loading…
        </div>
      }
    >
      <AttendanceClaimInner />
    </Suspense>
  );
}
