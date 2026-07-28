"use client";

import { Suspense, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";

/**
 * Legacy React kiosk path — redirect to the self-contained public HTML view
 * so Home Screen / bookmarks never hit the authenticated app shell.
 */
function PublicAttendanceKioskRedirect() {
  const params = useParams<{ gymCode: string }>();
  const search = useSearchParams();
  const gymCode = String(params?.gymCode || "").trim();
  const device = String(search.get("device") || search.get("token") || "").trim();

  useEffect(() => {
    if (!gymCode || !device) return;
    const next = `/api/public/attendance-kiosk/${encodeURIComponent(gymCode)}/view?device=${encodeURIComponent(device)}`;
    window.location.replace(next);
  }, [gymCode, device]);

  if (!gymCode || !device) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-center text-slate-200">
        <div>
          <h1 className="text-xl font-semibold">Missing kiosk link</h1>
          <p className="mt-2 text-sm text-slate-400">
            Open a new always-on punch QR URL from Settings (owner).
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
      Opening punch QR kiosk…
    </div>
  );
}

export default function PublicAttendanceKioskPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
          Opening punch QR kiosk…
        </div>
      }
    >
      <PublicAttendanceKioskRedirect />
    </Suspense>
  );
}
