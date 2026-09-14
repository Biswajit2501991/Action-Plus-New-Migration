"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Skeleton } from "@/components/ui/misc";
import { useSettings } from "@/hooks/use-data";
import {
  canAccessSection,
  hasAccess,
  isMasterOwnerUser,
} from "@/lib/domain/permissions";
import { STALE } from "@/lib/query-cache";
import { offersApi, type OfferMember, type OfferRedemption } from "@/services/api";
import { useAuthStore } from "@/stores";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

function digitsOnly(raw: string) {
  return String(raw || "").replace(/\D/g, "");
}

function computePay(totalCost: number, offerPercent: number) {
  if (!Number.isFinite(totalCost) || totalCost < 0) return null;
  if (!Number.isFinite(offerPercent) || offerPercent < 0 || offerPercent > 100) return null;
  return Math.round(totalCost * (1 - offerPercent / 100) * 100) / 100;
}

export function OffersPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const canView = canAccessSection(user, "Offers");
  const canRedeem =
    hasAccess(user, "offers", "redeemOffers") || hasAccess(user, "offers", "viewOffers");
  const canManage =
    isMasterOwnerUser(user) ||
    hasAccess(user, "offers", "manageOfferSettings") ||
    hasAccess(user, "settings", "manageSystemFeatures");

  const { data: settings } = useSettings("core", { enabled: canView && canManage });
  const statusOptions = useMemo(() => {
    const fromSettings = Array.isArray(settings?.statuses)
      ? settings!.statuses!.map((s) => String(s || "").trim()).filter(Boolean)
      : [];
    const base = fromSettings.length
      ? fromSettings
      : ["Active", "Hold", "Deactivated", "Cancelled"];
    return [...new Set(base)];
  }, [settings?.statuses]);

  const [mobile, setMobile] = useState("");
  const [member, setMember] = useState<OfferMember | null>(null);
  const [lookupMessage, setLookupMessage] = useState("");
  const [offerPercent, setOfferPercent] = useState("10");
  const [totalCost, setTotalCost] = useState("");
  const [passcode, setPasscode] = useState("");
  const [passcode2, setPasscode2] = useState("");
  const [draftStatuses, setDraftStatuses] = useState<string[] | null>(null);

  const settingsQuery = useQuery({
    queryKey: ["offers-settings"],
    queryFn: () => offersApi.settings(),
    enabled: canView,
    staleTime: STALE.settings,
  });

  const redemptionsQuery = useQuery({
    queryKey: ["offers-redemptions"],
    queryFn: () => offersApi.redemptions(),
    enabled: canView,
    staleTime: 15_000,
  });

  const eligibleStatuses = draftStatuses ?? settingsQuery.data?.eligibleStatuses ?? ["Active", "Hold"];

  const previewPay = useMemo(() => {
    const cost = Number(totalCost);
    const pct = Number(offerPercent);
    return computePay(cost, pct);
  }, [totalCost, offerPercent]);

  const lookupMutation = useMutation({
    mutationFn: () => offersApi.lookupMember(digitsOnly(mobile)),
    onSuccess: (res) => {
      if (!res.found || !res.member) {
        setMember(null);
        setLookupMessage(res.message || "Member not found.");
        return;
      }
      setMember(res.member);
      setLookupMessage("");
    },
    onError: (err: Error) => {
      setMember(null);
      setLookupMessage(err.message || "Lookup failed.");
    },
  });

  const redeemMutation = useMutation({
    mutationFn: () =>
      offersApi.redeem({
        mobile: digitsOnly(mobile),
        offerPercent: Number(offerPercent),
        totalCostInr: Number(totalCost),
      }),
    onSuccess: (res) => {
      toast.success(
        `Saved — customer pays ${formatCurrency(res.redemption?.customerPayInr ?? 0)}`,
      );
      setTotalCost("");
      void qc.invalidateQueries({ queryKey: ["offers-redemptions"] });
      if (Array.isArray(res.recent)) {
        qc.setQueryData(["offers-redemptions"], { redemptions: res.recent });
      }
    },
    onError: (err: Error) => toast.error(err.message || "Could not save redemption."),
  });

  const passcodeMutation = useMutation({
    mutationFn: () => offersApi.setPasscode(passcode),
    onSuccess: () => {
      toast.success("Passcode saved. You can sign in with login ID + passcode.");
      setPasscode("");
      setPasscode2("");
    },
    onError: (err: Error) => toast.error(err.message || "Could not save passcode."),
  });

  const statusesMutation = useMutation({
    mutationFn: () => offersApi.saveSettings(eligibleStatuses),
    onSuccess: (res) => {
      toast.success("Eligible statuses saved.");
      setDraftStatuses(null);
      qc.setQueryData(["offers-settings"], res);
    },
    onError: (err: Error) => toast.error(err.message || "Could not save statuses."),
  });

  if (!canView) {
    return (
      <div className="p-6">
        <PageHeader title="Offers" description="Partner shop desk" />
        <p className="mt-4 text-sm text-muted-foreground">
          You do not have access to Offers. Ask the gym owner to grant the Offers section.
        </p>
      </div>
    );
  }

  const onLookup = (e: FormEvent) => {
    e.preventDefault();
    lookupMutation.mutate();
  };

  const onRedeem = (e: FormEvent) => {
    e.preventDefault();
    if (!member) {
      toast.error("Look up a member first.");
      return;
    }
    if (previewPay == null) {
      toast.error("Enter a valid offer % and total cost.");
      return;
    }
    redeemMutation.mutate();
  };

  const onPasscode = (e: FormEvent) => {
    e.preventDefault();
    if (passcode.length < 4) {
      toast.error("Passcode must be at least 4 characters.");
      return;
    }
    if (passcode !== passcode2) {
      toast.error("Passcodes do not match.");
      return;
    }
    passcodeMutation.mutate();
  };

  const redemptions: OfferRedemption[] = redemptionsQuery.data?.redemptions || [];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 pb-24 sm:p-6">
      <PageHeader
        title="Offers"
        description="Verify Action Plus members and log shop discounts. Does not change gym payments or member amounts."
      />

      {canManage ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Shop setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Create a staff login (Staff page) with <strong className="text-foreground">Offers only</strong>,
              set password, and assign the branches this shop may serve. The shop signs in with that
              login ID + password, then can set a short passcode below.
            </p>
            <div>
              <p className="mb-2 font-medium text-foreground">Eligible member statuses</p>
              <div className="flex flex-wrap gap-2">
                {statusOptions.map((st) => {
                  const on = eligibleStatuses.some((s) => s.toLowerCase() === st.toLowerCase());
                  return (
                    <button
                      key={st}
                      type="button"
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                        on
                          ? "border-teal-600 bg-teal-50 text-teal-900 dark:bg-teal-950/40 dark:text-teal-100"
                          : "border-border bg-background text-muted-foreground",
                      )}
                      onClick={() => {
                        const next = on
                          ? eligibleStatuses.filter((s) => s.toLowerCase() !== st.toLowerCase())
                          : [...eligibleStatuses, st];
                        setDraftStatuses(next);
                      }}
                    >
                      {st}
                    </button>
                  );
                })}
              </div>
              <Button
                className="mt-3"
                size="sm"
                disabled={statusesMutation.isPending || eligibleStatuses.length === 0}
                onClick={() => statusesMutation.mutate()}
              >
                {statusesMutation.isPending ? "Saving…" : "Save statuses"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Member lookup</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onLookup} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="offer-mobile">
                Mobile number
              </label>
              <input
                id="offer-mobile"
                inputMode="numeric"
                autoComplete="tel"
                value={mobile}
                onChange={(e) => setMobile(digitsOnly(e.target.value).slice(0, 12))}
                placeholder="10-digit mobile"
                className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-teal-500/30"
              />
            </div>
            <Button type="submit" disabled={lookupMutation.isPending || mobile.length < 10}>
              {lookupMutation.isPending ? "Checking…" : "Verify member"}
            </Button>
          </form>

          {lookupMessage ? (
            <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">{lookupMessage}</p>
          ) : null}

          {member ? (
            <div className="mt-4 flex items-center gap-4 rounded-xl border border-border bg-muted/30 p-3">
              {member.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={member.photoUrl}
                  alt=""
                  className="h-16 w-16 rounded-full object-cover ring-1 ring-border"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-sm font-medium">
                  {(member.fullName || "?").slice(0, 1)}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{member.fullName}</p>
                <p className="text-xs text-teal-700 dark:text-teal-300">{member.label || "Action Plus Gym Member"}</p>
                <p className="text-xs text-muted-foreground">
                  {member.status} · {member.mobile}
                  {member.memberCode ? ` · ${member.memberCode}` : ""}
                </p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Calculate & save offer</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onRedeem} className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="offer-pct">
                Offer %
              </label>
              <input
                id="offer-pct"
                inputMode="decimal"
                value={offerPercent}
                onChange={(e) => setOfferPercent(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-teal-500/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground" htmlFor="offer-cost">
                Total cost (₹)
              </label>
              <input
                id="offer-cost"
                inputMode="decimal"
                value={totalCost}
                onChange={(e) => setTotalCost(e.target.value)}
                placeholder="0"
                className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-teal-500/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Customer pays</label>
              <div className="mt-1 flex h-11 items-center rounded-xl border border-teal-600/30 bg-teal-50/80 px-3 text-sm font-semibold text-teal-950 dark:bg-teal-950/40 dark:text-teal-50">
                {previewPay == null ? "—" : formatCurrency(previewPay)}
              </div>
            </div>
            <div className="sm:col-span-3">
              <Button
                type="submit"
                disabled={!canRedeem || !member || redeemMutation.isPending || previewPay == null}
              >
                {redeemMutation.isPending ? "Saving…" : "Save redemption"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Last 10 redemptions</CardTitle>
        </CardHeader>
        <CardContent>
          {redemptionsQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : redemptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No redemptions yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {redemptions.map((row) => (
                <li key={row.id} className="flex flex-col gap-0.5 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{row.memberName || row.memberMobile}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.offerPercent}% off · cost {formatCurrency(row.totalCostInr)} · pay{" "}
                      {formatCurrency(row.customerPayInr)}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    {row.createdAt ? formatDate(row.createdAt) : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Shop passcode (optional)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            After the gym sets your login ID + password, you can add a passcode and use either to sign in.
          </p>
          <form onSubmit={onPasscode} className="grid gap-3 sm:grid-cols-2">
            <input
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="New passcode"
              className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-teal-500/30"
            />
            <input
              type="password"
              value={passcode2}
              onChange={(e) => setPasscode2(e.target.value)}
              placeholder="Confirm passcode"
              className="h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-teal-500/30"
            />
            <div className="sm:col-span-2">
              <Button type="submit" variant="secondary" disabled={passcodeMutation.isPending}>
                {passcodeMutation.isPending ? "Saving…" : "Set passcode"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
