"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/services/api/client";
import { formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores";
import { canAccessSection, hasAccess } from "@/lib/domain/permissions";

type PortalVerifyItem = {
  id: string;
  memberUuid: string;
  memberCode: string | null;
  fullName: string | null;
  mobile: string | null;
  membershipStatus: string | null;
  staffStatus: string;
  otpForStaff: string | null;
  createdAt: string;
  expiresAt: string;
  approvedAt?: string | null;
  approvedBy?: string | null;
};

export function PortalVerifyPage() {
  const user = useAuthStore((s) => s.user);
  const canUse =
    canAccessSection(user, "WhatsApp Verification") ||
    canAccessSection(user, "Members");
  const canApprove = hasAccess(user, "members", "editMembers");

  const [items, setItems] = useState<PortalVerifyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ ok?: boolean; items?: PortalVerifyItem[] }>(
        "/portal-verifications?status=pending",
      );
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Could not load requests";
      setError(
        msg.includes("404")
          ? "API not reachable (404). Redeploy may still be finishing — click Refresh."
          : msg,
      );
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canUse) void load();
  }, [canUse, load]);

  useEffect(() => {
    if (!canUse) return;
    const id = window.setInterval(() => void load(), 8000);
    return () => window.clearInterval(id);
  }, [canUse, load]);

  if (!canUse) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        You do not have access to WhatsApp Verification.
      </div>
    );
  }

  async function approve(id: string) {
    setBusyId(id);
    try {
      await apiFetch(`/portal-verifications/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        body: "{}",
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    if (!window.confirm("Reject this portal verification request?")) return;
    setBusyId(id);
    try {
      await apiFetch(`/portal-verifications/${encodeURIComponent(id)}/reject`, {
        method: "POST",
        body: JSON.stringify({ note: "rejected by staff" }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">WhatsApp Verification</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Members request portal access from the website. Confirm the number matches the
            membership, then Approve so they can set a PIN.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Gym WhatsApp for alerts: +91 70471 57510
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {loading && !items.length ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : null}

      {!loading && items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          No pending verification requests.
        </div>
      ) : null}

      <ul className="space-y-3">
        {items.map((item) => {
          const expired = new Date(item.expiresAt).getTime() < Date.now();
          return (
            <li
              key={item.id}
              className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold">
                    {item.fullName || "Unknown member"}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      {item.memberCode || ""}
                    </span>
                  </p>
                  <p className="text-sm">
                    Mobile: <span className="font-mono">{item.mobile || "—"}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Status: {item.membershipStatus || "—"} · Requested{" "}
                    {formatDate(item.createdAt)}
                    {expired ? " · Expired" : ""}
                  </p>
                  {item.otpForStaff ? (
                    <p className="text-xs">
                      Staff OTP ref:{" "}
                      <span className="font-mono font-semibold tracking-wider">
                        {item.otpForStaff}
                      </span>
                    </p>
                  ) : null}
                </div>
                {canApprove && !expired ? (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busyId === item.id}
                      onClick={() => void approve(item.id)}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" />
                      Approve
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyId === item.id}
                      onClick={() => void reject(item.id)}
                    >
                      <X className="mr-1 h-3.5 w-3.5" />
                      Reject
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
