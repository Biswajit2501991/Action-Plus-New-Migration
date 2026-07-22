"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useGymCodes, useSettings } from "@/hooks/use-data";
import { isAttendancePresenceQrEnabled } from "@/lib/domain/attendance";
import { attendanceClaimUrl, qrImageUrl } from "@/lib/qr";
import { attendanceApi } from "@/services/api";
import { useAuthStore } from "@/stores";

type RotateState = {
  token: string;
  expiresAt: string;
  expiresInSec: number;
  claimUrl: string;
};

export default function AttendanceKioskPage() {
  const user = useAuthStore((s) => s.user);
  const { data: settings } = useSettings();
  const { data: gymCodes = [] } = useGymCodes();
  const requireQrEnabled = isAttendancePresenceQrEnabled(settings as Record<string, unknown>);
  const branchId = useMemo(() => {
    const active = String(user?.activeBranchId || user?.gymCodeId || "").trim();
    if (active) return active;
    return String(gymCodes[0]?.id || "").trim();
  }, [user?.activeBranchId, user?.gymCodeId, gymCodes]);

  const [state, setState] = useState<RotateState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      if (!branchId) {
        throw new Error("No branch selected. Switch branch in the header, then refresh.");
      }
      const rotated = await attendanceApi.rotatePresence({ gymCodeId: branchId });
      const token = String(rotated.token || "").trim();
      if (!token) throw new Error("No token returned");
      setState({
        token,
        expiresAt: String(rotated.expiresAt || ""),
        expiresInSec: Number(rotated.expiresInSec || 90),
        claimUrl: attendanceClaimUrl(token),
      });
      setNowMs(Date.now());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not refresh attendance QR";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }, [branchId]);

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
        Attendance QR
      </p>
      <h1 className="mt-2 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
        Staff: scan to enable today&apos;s Time In
      </h1>
      <p className="mt-2 max-w-md text-center text-sm text-slate-400">
        Open the camera on your phone, scan this code, then log in. The code refreshes
        automatically — nothing to upload.
      </p>

      {!requireQrEnabled ? (
        <p className="mt-3 max-w-md rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-xs text-amber-100">
          Settings → <span className="font-semibold">Require attendance QR for Time In</span> is
          off. You can still display this QR for setup; login will not require it until the
          toggle is on.
        </p>
      ) : null}

      <div className="mt-8 rounded-3xl border border-white/10 bg-white p-4 shadow-2xl">
        {state?.claimUrl ? (
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

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="border-white/20 bg-transparent text-slate-100 hover:bg-white/10"
          onClick={() => void refresh()}
          disabled={busy}
        >
          Refresh now
        </Button>
        <Button
          type="button"
          variant="outline"
          className="border-white/20 bg-transparent text-slate-100 hover:bg-white/10"
          onClick={() => {
            window.location.href = "/attendance";
          }}
        >
          Exit kiosk
        </Button>
        <Link
          href="/settings"
          className="inline-flex h-10 items-center rounded-xl border border-white/20 px-4 text-sm text-slate-100 hover:bg-white/10"
        >
          Settings
        </Link>
      </div>
    </div>
  );
}
