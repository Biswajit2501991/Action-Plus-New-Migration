"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/services/api/client";
import { useAuthStore } from "@/stores";
import { canAccessSection, hasAccess } from "@/lib/domain/permissions";
import { MemberQrCameraScanner } from "@/features/member-checkin/member-qr-camera-scanner";

export function MemberCheckinPage() {
  const user = useAuthStore((s) => s.user);
  const canUse =
    hasAccess(user, "attendance", "viewMemberQrCheckin") ||
    canAccessSection(user, "Attendance") ||
    canAccessSection(user, "Members");
  const canWrite =
    hasAccess(user, "attendance", "viewMemberQrCheckin") ||
    hasAccess(user, "members", "editMembers");

  const [payload, setPayload] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submitPayload = useCallback(
    async (raw: string) => {
      if (!canWrite) return;
      const qrPayload = String(raw || "").trim();
      if (!qrPayload) return;
      setBusy(true);
      setError(null);
      setResult(null);
      setPayload(qrPayload);
      try {
        const data = await apiFetch<{
          ok?: boolean;
          deduped?: boolean;
          member?: { fullName?: string; memberCode?: string; status?: string };
          record?: { checked_in_at?: string };
        }>("/attendance/member-checkin", {
          method: "POST",
          body: JSON.stringify({ qrPayload }),
        });
        setResult(
          `${data.deduped ? "Already checked in: " : "Checked in: "}${data.member?.fullName || ""} (${data.member?.memberCode || ""}) · ${data.member?.status || ""} · ${data.record?.checked_in_at || ""}`,
        );
        setPayload("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Check-in failed");
      } finally {
        setBusy(false);
      }
    },
    [canWrite],
  );

  if (!canUse) {
    return <div className="p-6 text-sm text-muted-foreground">No access.</div>;
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 md:p-6">
      <h1 className="text-xl font-semibold">Scan member QR</h1>
      <p className="text-sm text-muted-foreground">
        Scan the member&apos;s digital QR Card with the camera, or paste an APG1 code below.
      </p>

      {canWrite ? (
        <MemberQrCameraScanner
          disabled={busy}
          onScan={(code) => void submitPayload(code)}
        />
      ) : (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          You can view this page, but check-in requires member edit access.
        </p>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Or paste APG1 code</p>
        <textarea
          className="min-h-24 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs"
          placeholder="APG1...."
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          disabled={busy}
        />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {result ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{result}</p> : null}

      <Button
        type="button"
        disabled={busy || !payload.trim() || !canWrite}
        onClick={() => void submitPayload(payload)}
      >
        {busy ? "Submitting…" : "Check in member"}
      </Button>
    </div>
  );
}
