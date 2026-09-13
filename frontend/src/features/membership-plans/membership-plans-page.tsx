"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Skeleton, EmptyState } from "@/components/ui/misc";
import { apiFetch } from "@/services/api/client";
import { canAccessSection, hasAccess, isMasterOwnerUser } from "@/lib/domain/permissions";
import { useAuthStore } from "@/stores";
import { cn } from "@/lib/utils";

export type CatalogPlan = {
  planName: string;
  listPriceInr: number | null;
  tagline: string;
  inclusions: string[];
  isEnabled: boolean;
  sortOrder: number;
  hasCatalogRow?: boolean;
};

type CatalogResponse = {
  ok?: boolean;
  masterEnabled?: boolean;
  plans?: CatalogPlan[];
  error?: string;
};

function formatInr(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export function MembershipPlansPage() {
  const user = useAuthStore((s) => s.user);
  const isOwner = isMasterOwnerUser(user);
  const canView =
    isOwner ||
    canAccessSection(user, "Members") ||
    hasAccess(user, "settings", "managePlans");
  const canEdit = isOwner || hasAccess(user, "settings", "managePlans");

  const [loading, setLoading] = useState(true);
  const [masterEnabled, setMasterEnabled] = useState(true);
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, CatalogPlan>>({});

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<CatalogResponse>("/membership-plans-catalog");
      setMasterEnabled(data.masterEnabled !== false);
      const list = Array.isArray(data.plans) ? data.plans : [];
      setPlans(list);
      const next: Record<string, CatalogPlan> = {};
      for (const p of list) {
        next[p.planName] = {
          ...p,
          inclusions: [...(p.inclusions || [])],
          tagline: p.tagline || "",
        };
      }
      setDrafts(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load plans");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) void load();
  }, [canView]);

  const showcasePlans = useMemo(() => {
    if (!masterEnabled) return [];
    return plans.filter((p) => p.isEnabled !== false);
  }, [plans, masterEnabled]);

  const savePlan = async (planName: string) => {
    const draft = drafts[planName];
    if (!draft) return;
    setSaving(true);
    try {
      const res = await apiFetch<{ ok?: boolean; plan?: CatalogPlan }>(
        "/membership-plans-catalog",
        {
          method: "PUT",
          body: JSON.stringify({
            planName,
            listPriceInr: draft.listPriceInr,
            tagline: draft.tagline,
            inclusions: draft.inclusions,
            isEnabled: draft.isEnabled,
            sortOrder: draft.sortOrder,
          }),
        },
      );
      toast.success(`Saved ${planName}`);
      if (res.plan) {
        setPlans((prev) =>
          prev.map((p) => (p.planName === planName ? { ...p, ...res.plan! } : p)),
        );
        setDrafts((prev) => ({
          ...prev,
          [planName]: { ...prev[planName], ...res.plan! },
        }));
      } else {
        await load();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleMaster = async (next: boolean) => {
    setSaving(true);
    try {
      const res = await apiFetch<{ masterEnabled?: boolean }>(
        "/membership-plans-catalog/master",
        {
          method: "PATCH",
          body: JSON.stringify({ enabled: next }),
        },
      );
      setMasterEnabled(res.masterEnabled !== false);
      toast.success(next ? "Plans showcase turned on" : "Plans showcase turned off");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update master switch");
    } finally {
      setSaving(false);
    }
  };

  if (!canView) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Membership Plans access is disabled for this profile.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 p-2">
        <Skeleton className="h-12 w-72" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[70vh] overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-b from-slate-50 via-white to-slate-100/80 dark:border-border dark:from-slate-950 dark:via-card dark:to-slate-950">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 10%, rgba(15,23,42,0.08), transparent 40%), radial-gradient(circle at 80% 0%, rgba(13,148,136,0.12), transparent 35%)",
        }}
      />

      <div className="relative space-y-8 p-5 sm:p-8 lg:p-10">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-800/80 dark:text-teal-300/90">
              Action Plus
            </p>
            <h1 className="mt-2 font-serif text-3xl tracking-tight text-slate-900 sm:text-4xl dark:text-slate-50">
              Membership Plans
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Clear options for every goal — gym access, guidance, and what is included.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <>
                <button
                  type="button"
                  role="switch"
                  aria-checked={masterEnabled}
                  disabled={saving}
                  onClick={() => void toggleMaster(!masterEnabled)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
                    masterEnabled
                      ? "border-teal-700/30 bg-teal-50 text-teal-900 dark:border-teal-500/40 dark:bg-teal-950/40 dark:text-teal-100"
                      : "border-slate-300 bg-white text-slate-600 dark:border-border dark:bg-muted",
                  )}
                >
                  Showcase {masterEnabled ? "On" : "Off"}
                </button>
                <Button
                  type="button"
                  size="sm"
                  variant={editMode ? "default" : "outline"}
                  onClick={() => setEditMode((v) => !v)}
                >
                  {editMode ? (
                    <>
                      <X className="h-3.5 w-3.5" />
                      Done editing
                    </>
                  ) : (
                    <>
                      <Pencil className="h-3.5 w-3.5" />
                      Edit plans
                    </>
                  )}
                </Button>
              </>
            ) : null}
          </div>
        </header>

        {!masterEnabled && !editMode ? (
          <EmptyState
            title="Plans showcase is turned off"
            description="Turn Showcase On in Edit plans to show membership options to customers."
          />
        ) : null}

        {editMode && canEdit ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {plans.map((plan) => {
              const draft = drafts[plan.planName] || plan;
              const inclusionsText = (draft.inclusions || []).join("\n");
              return (
                <div
                  key={plan.planName}
                  className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm dark:border-border dark:bg-card"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                      {plan.planName}
                    </h2>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={draft.isEnabled !== false}
                      disabled={saving}
                      onClick={() =>
                        setDrafts((prev) => ({
                          ...prev,
                          [plan.planName]: {
                            ...draft,
                            isEnabled: !(draft.isEnabled !== false),
                          },
                        }))
                      }
                      className={cn(
                        "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                        draft.isEnabled !== false
                          ? "bg-slate-900 dark:bg-teal-600"
                          : "bg-slate-300 dark:bg-slate-600",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform",
                          draft.isEnabled !== false && "translate-x-5",
                        )}
                      />
                    </button>
                  </div>
                  <div className="mt-3 space-y-3">
                    <div>
                      <Label>List price (₹)</Label>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        className="mt-1"
                        value={draft.listPriceInr ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDrafts((prev) => ({
                            ...prev,
                            [plan.planName]: {
                              ...draft,
                              listPriceInr: v === "" ? null : Number(v),
                            },
                          }));
                        }}
                      />
                    </div>
                    <div>
                      <Label>Short tagline</Label>
                      <Input
                        className="mt-1"
                        maxLength={200}
                        value={draft.tagline || ""}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [plan.planName]: { ...draft, tagline: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <div>
                      <Label>What is included (one per line)</Label>
                      <textarea
                        className="mt-1 min-h-[120px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={inclusionsText}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [plan.planName]: {
                              ...draft,
                              inclusions: e.target.value
                                .split("\n")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            },
                          }))
                        }
                      />
                    </div>
                    <Button
                      size="sm"
                      disabled={saving}
                      onClick={() => void savePlan(plan.planName)}
                    >
                      Save {plan.planName}
                    </Button>
                  </div>
                </div>
              );
            })}
            {!plans.length ? (
              <EmptyState
                title="No plan names yet"
                description="Add plan names under Settings → Business Configuration → Plans, then return here to add price and details."
              />
            ) : null}
          </div>
        ) : null}

        {masterEnabled && !editMode ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {showcasePlans.map((plan, index) => {
              const price = formatInr(plan.listPriceInr);
              const inclusions = plan.inclusions?.length
                ? plan.inclusions
                : ["Details coming soon — ask the team for the latest inclusions."];
              return (
                <article
                  key={plan.planName}
                  className="group flex flex-col rounded-3xl border border-slate-200/90 bg-white/95 p-6 shadow-[0_18px_50px_-28px_rgba(15,23,42,0.35)] transition duration-300 hover:-translate-y-0.5 dark:border-border dark:bg-card"
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="font-serif text-2xl tracking-tight text-slate-900 dark:text-slate-50">
                      {plan.planName}
                    </h2>
                    {price ? (
                      <p className="text-lg font-semibold tabular-nums text-teal-800 dark:text-teal-300">
                        {price}
                      </p>
                    ) : (
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Ask for price
                      </p>
                    )}
                  </div>
                  {plan.tagline ? (
                    <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      {plan.tagline}
                    </p>
                  ) : null}
                  <ul className="mt-5 flex-1 space-y-2.5">
                    {inclusions.map((item) => (
                      <li key={item} className="flex gap-2.5 text-sm text-slate-700 dark:text-slate-200">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-200">
                          <Check className="h-3 w-3" />
                        </span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
            {!showcasePlans.length ? (
              <div className="md:col-span-2 xl:col-span-3">
                <EmptyState
                  title="No plans to show"
                  description={
                    canEdit
                      ? "Enable at least one plan in Edit plans, or add plan names in Settings."
                      : "Ask the owner to publish membership plans."
                  }
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
