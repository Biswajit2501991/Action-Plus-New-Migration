"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/services/api/client";
import { useAuthStore } from "@/stores";
import { canAccessSection, hasAccess } from "@/lib/domain/permissions";

export function MemberCheckinPage() {
  const user = useAuthStore((s) => s.user);
  const canUse =
    canAccessSection(user, "Attendance") || canAccessSection(user, "Members");
  const canWrite = hasAccess(user, "members", "editMembers");

  const [payload, setPayload] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!canUse) {
    return <div className="p-6 text-sm text-muted-foreground">No access.</div>;
  }

  async function submit() {
    if (!canWrite) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = await apiFetch<{
        ok?: boolean;
        deduped?: boolean;
        member?: { fullName?: string; memberCode?: string; status?: string };
        record?: { checked_in_at?: string };
      }>("/attendance/member-checkin", {
        method: "POST",
        body: JSON.stringify({ qrPayload: payload.trim() }),
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
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-4 md:p-6">
      <h1 className="text-xl font-semibold">Scan member QR</h1>
      <p className="text-sm text-muted-foreground">
        Paste the scanned APG1 membership QR payload from the member&apos;s digital card to submit attendance.
      </p>
      <textarea
        className="min-h-28 w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs"
        placeholder="APG1...."
        value={payload}
        onChange={(e) => setPayload(e.target.value)}
      />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {result ? <p className="text-sm text-emerald-700">{result}</p> : null}
      <Button
        type="button"
        disabled={busy || !payload.trim() || !canWrite}
        onClick={() => void submit()}
      >
        {busy ? "Submitting…" : "Check in member"}
      </Button>
    </div>
  );
}
