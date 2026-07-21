"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, RefreshCw, ShieldOff, X } from "lucide-react";
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

  const [pending, setPending] = useState<PortalVerifyItem[]>([]);
  const [approved, setApproved] = useState<PortalVerifyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const hasLoadedOnce = useRef(false);

  const load = useCallback(async (opts?: { background?: boolean }) => {
    const background = Boolean(opts?.background);
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
      setError(null);
    }
    try {
      const [pendingRes, approvedRes] = await Promise.all([
        apiFetch<{ ok?: boolean; items?: PortalVerifyItem[] }>(
          "/portal-verifications?status=pending",
        ),
        apiFetch<{ ok?: boolean; items?: PortalVerifyItem[] }>(
          "/portal-verifications?status=approved",
        ),
      ]);
      setPending(Array.isArray(pendingRes.items) ? pendingRes.items : []);
      const seen = new Set<string>();
      const approvedDeduped: PortalVerifyItem[] = [];
      for (const row of Array.isArray(approvedRes.items) ? approvedRes.items : []) {
        const key = row.memberUuid || row.id;
        if (seen.has(key)) continue;
        seen.add(key);
        approvedDeduped.push(row);
      }
      setApproved(approvedDeduped);
      setError(null);
      hasLoadedOnce.current = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load requests";
      // Background refresh: keep existing rows, only surface error if never loaded.
      if (!background || !hasLoadedOnce.current) {
        setError(msg);
        if (!hasLoadedOnce.current) {
          setPending([]);
          setApproved([]);
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (canUse) void load({ background: false });
  }, [canUse, load]);

  useEffect(() => {
    if (!canUse) return;
    const id = window.setInterval(() => void load({ background: true }), 8000);
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
      await load({ background: true });
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
      await load({ background: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setBusyId(null);
    }
  }

  async function revoke(id: string, name: string | null) {
    if (
      !window.confirm(
        `Revoke portal access for ${name || "this member"}? They will be logged out and must verify via WhatsApp again.`,
      )
    ) {
      return;
    }
    setBusyId(id);
    try {
      await apiFetch(`/portal-verifications/${encodeURIComponent(id)}/revoke`, {
        method: "POST",
        body: "{}",
      });
      await load({ background: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setBusyId(null);
    }
  }

  function PendingCard({ item }: { item: PortalVerifyItem }) {
    const expired = new Date(item.expiresAt).getTime() < Date.now();
    return (
      <li className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
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
              Status: {item.membershipStatus || "—"} · Requested {formatDate(item.createdAt)}
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
  }

  function ApprovedCard({ item }: { item: PortalVerifyItem }) {
    return (
      <li className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
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
              Approved{" "}
              {item.approvedAt ? formatDate(item.approvedAt) : formatDate(item.createdAt)}
              {item.approvedBy ? ` · by ${item.approvedBy}` : ""}
            </p>
          </div>
          {canApprove ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busyId === item.id}
              onClick={() => void revoke(item.id, item.fullName)}
            >
              <ShieldOff className="mr-1 h-3.5 w-3.5" />
              Revoke
            </Button>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">WhatsApp Verification</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Members request portal access from the website. Confirm the number matches the
            membership, then Approve so they can set a PIN.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Gym WhatsApp for alerts: +91 70471 57510
            {refreshing ? " · Updating…" : ""}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load({ background: true })}
          disabled={loading || refreshing}
        >
          <RefreshCw
            className={`mr-1.5 h-3.5 w-3.5 ${loading || refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {loading && !pending.length && !approved.length ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Pending
            </h2>
            <span className="text-xs text-muted-foreground">{pending.length}</span>
          </div>
          {!loading && pending.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No pending verification requests.
            </div>
          ) : null}
          <ul className="space-y-3">
            {pending.map((item) => (
              <PendingCard key={item.id} item={item} />
            ))}
          </ul>
        </section>

        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Approved
            </h2>
            <span className="text-xs text-muted-foreground">{approved.length}</span>
          </div>
          {!loading && approved.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              No approved members yet.
            </div>
          ) : null}
          <ul className="space-y-3">
            {approved.map((item) => (
              <ApprovedCard key={item.id} item={item} />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
