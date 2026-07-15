"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/use-data";
import { isQrVisitorAttendanceEnabled } from "@/lib/domain/attendance";
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
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const qrFlowsEnabled = isQrVisitorAttendanceEnabled(settings as Record<string, unknown>);
  const [state, setState] = useState<RotateState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!qrFlowsEnabled) return;
    setBusy(true);
    setError("");
    try {
      const rotated = await attendanceApi.rotatePresence({
        gymCodeId: String(user?.activeBranchId || user?.gymCodeId || ""),
      });
      const token = String(rotated.token || "").trim();
      if (!token) throw new Error("No token returned");
      setState({
        token,
        expiresAt: String(rotated.expiresAt || ""),
        expiresInSec: Number(rotated.expiresInSec || 90),
        claimUrl: attendanceClaimUrl(token),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not refresh attendance QR";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }, [qrFlowsEnabled, user?.activeBranchId, user?.gymCodeId]);

  useEffect(() => {
    if (!settingsLoading && qrFlowsEnabled) void refresh();
  }, [settingsLoading, qrFlowsEnabled, refresh]);

  useEffect(() => {
    if (!qrFlowsEnabled || !state?.expiresInSec) return;
    const waitMs = Math.max(15_000, Math.floor(state.expiresInSec * 1000 * 0.55));
    const t = window.setTimeout(() => {
      void refresh();
    }, waitMs);
    return () => window.clearTimeout(t);
  }, [qrFlowsEnabled, state?.token, state?.expiresInSec, refresh]);

  if (settingsLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950 text-slate-300">
        Loading…
      </div>
    );
  }

  if (!qrFlowsEnabled) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 px-4 text-center text-slate-100">
        <h1 className="text-2xl font-semibold">QR Visitor & Attendance is off</h1>
        <p className="mt-2 max-w-md text-sm text-slate-400">
          An owner must enable <span className="text-teal-300">QR Visitor & Attendance</span> in
          Settings before the kiosk and Visitor QR are available.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            href="/settings"
            className="inline-flex h-10 items-center rounded-xl bg-teal-400 px-4 text-sm font-semibold text-slate-950"
          >
            Open Settings
          </Link>
          <Link
            href="/attendance"
            className="inline-flex h-10 items-center rounded-xl border border-white/20 px-4 text-sm text-slate-100"
          >
            Back to Attendance
          </Link>
        </div>
      </div>
    );
  }

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
        automatically.
      </p>

      <div className="mt-8 rounded-3xl border border-white/10 bg-white p-4 shadow-2xl">
        {state?.claimUrl ? (
          <img
            src={qrImageUrl(state.claimUrl, 320)}
            alt="Attendance presence QR"
            className="h-72 w-72 sm:h-80 sm:w-80"
          />
        ) : (
          <div className="flex h-72 w-72 items-center justify-center text-sm text-slate-500 sm:h-80 sm:w-80">
            {busy ? "Loading…" : "No QR yet"}
          </div>
        )}
      </div>

      {error ? (
        <p className="mt-4 max-w-md text-center text-sm text-rose-300">{error}</p>
      ) : (
        <p className="mt-4 text-xs text-slate-500">
          Rotates about every {Math.max(15, Math.floor((state?.expiresInSec || 90) * 0.55))}s
          {state?.expiresAt ? ` · valid until ${new Date(state.expiresAt).toLocaleTimeString()}` : ""}
        </p>
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
      </div>
    </div>
  );
}
