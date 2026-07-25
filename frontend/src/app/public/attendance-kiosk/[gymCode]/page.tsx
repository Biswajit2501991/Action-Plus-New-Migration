"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { attendanceClaimUrl, qrImageUrl } from "@/lib/qr";

type RotateState = {
  token: string;
  expiresAt: string;
  expiresInSec: number;
  claimUrl: string;
  label?: string;
};

function PublicAttendanceKioskInner() {
  const params = useParams<{ gymCode: string }>();
  const search = useSearchParams();
  const gymCode = String(params?.gymCode || "").trim();
  const device = String(search.get("device") || search.get("token") || "").trim();

  const [state, setState] = useState<RotateState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const rotateUrl = useMemo(() => {
    if (!gymCode || !device) return "";
    return `/api/public/attendance-kiosk/${encodeURIComponent(gymCode)}/rotate?device=${encodeURIComponent(device)}`;
  }, [gymCode, device]);

  const refresh = useCallback(async () => {
    if (!rotateUrl) {
      setError("Missing kiosk device link. Open a new URL from Settings.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(rotateUrl, { credentials: "omit", cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        token?: string;
        expiresAt?: string;
        expiresInSec?: number;
        claimPath?: string;
        label?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.message || data.error || `HTTP ${res.status}`);
      }
      const token = String(data.token || "").trim();
      if (!token) throw new Error("No punch token returned");
      setState({
        token,
        expiresAt: String(data.expiresAt || ""),
        expiresInSec: Number(data.expiresInSec || 90),
        claimUrl: attendanceClaimUrl(token),
        label: data.label,
      });
      setNowMs(Date.now());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not refresh punch QR");
    } finally {
      setBusy(false);
    }
  }, [rotateUrl]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!state?.expiresInSec) return;
    const waitMs = Math.max(15_000, Math.floor(state.expiresInSec * 1000 * 0.55));
    const t = window.setTimeout(() => {
      void refresh();
    }, waitMs);
    return () => window.clearTimeout(t);
  }, [state?.token, state?.expiresInSec, refresh]);

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const secondsLeft = useMemo(() => {
    if (!state?.expiresAt) return null;
    const end = new Date(state.expiresAt).getTime();
    if (!Number.isFinite(end)) return null;
    return Math.max(0, Math.ceil((end - nowMs) / 1000));
  }, [state?.expiresAt, nowMs]);

  const timerLabel = useMemo(() => {
    if (secondsLeft == null) return null;
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }, [secondsLeft]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 px-4 text-slate-100">
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-teal-300/80">
        Always-on punch QR
      </p>
      <h1 className="mt-2 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
        Staff: scan to enable today&apos;s Time In
      </h1>
      <p className="mt-2 max-w-md text-center text-sm text-slate-400">
        Wall tablet mode — no staff login. The code refreshes automatically.
        {state?.label ? (
          <>
            {" "}
            · <span className="text-slate-300">{state.label}</span>
          </>
        ) : null}
      </p>

      <div className="mt-8 rounded-3xl border border-white/10 bg-white p-4 shadow-2xl">
        {state?.claimUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrImageUrl(state.claimUrl, 320)}
            alt="Attendance presence QR"
            className="h-72 w-72 sm:h-80 sm:w-80"
          />
        ) : (
          <div className="flex h-72 w-72 items-center justify-center text-sm text-slate-500 sm:h-80 sm:w-80">
            {busy ? "Generating QR…" : "No QR yet"}
          </div>
        )}
      </div>

      {error ? (
        <p className="mt-4 max-w-md text-center text-sm text-rose-300">{error}</p>
      ) : (
        <div className="mt-5 text-center">
          {timerLabel ? (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-300/80">
                Code valid for
              </p>
              <p className="mt-1 font-mono text-4xl font-semibold tracking-tight text-white tabular-nums sm:text-5xl">
                {timerLabel}
              </p>
            </>
          ) : null}
          <p className="mt-2 text-xs text-slate-500">
            Auto-refreshes about every{" "}
            {Math.max(15, Math.floor((state?.expiresInSec || 90) * 0.55))}s
            {state?.expiresAt
              ? ` · until ${new Date(state.expiresAt).toLocaleTimeString()}`
              : ""}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => void refresh()}
        disabled={busy}
        className="mt-6 inline-flex h-10 items-center rounded-xl border border-white/20 px-4 text-sm text-slate-100 hover:bg-white/10 disabled:opacity-50"
      >
        Refresh now
      </button>
    </div>
  );
}

export default function PublicAttendanceKioskPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
          Loading kiosk…
        </div>
      }
    >
      <PublicAttendanceKioskInner />
    </Suspense>
  );
}
