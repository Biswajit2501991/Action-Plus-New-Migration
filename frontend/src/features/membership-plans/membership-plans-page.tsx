"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Skeleton, EmptyState } from "@/components/ui/misc";
import { apiFetch } from "@/services/api/client";
import { canAccessSection, hasAccess, isMasterOwnerUser } from "@/lib/domain/permissions";
import { useAuthStore, useBranchStore } from "@/stores";
import { cn } from "@/lib/utils";

export type CatalogPlan = {
  planName: string;
  gymCodeId?: string | null;
  listPriceInr: number | null;
  tagline: string;
  details: string;
  inclusions: string[];
  isEnabled: boolean;
  sortOrder: number;
  hasCatalogRow?: boolean;
};

type CatalogResponse = {
  ok?: boolean;
  masterEnabled?: boolean;
  plans?: CatalogPlan[];
  gymCodeId?: string;
  branchName?: string;
  gymCode?: string;
  branchLabel?: string;
  branchRequired?: boolean;
  message?: string;
};

type ExplainLanguage = "original" | "hi" | "bn" | "hinglish";

type ExplainFields = {
  tagline: string;
  details: string;
  inclusions: string[];
};

const EXPLAIN_OPTIONS: { id: ExplainLanguage; label: string }[] = [
  { id: "original", label: "Original" },
  { id: "hi", label: "हिंदी" },
  { id: "bn", label: "বাংলা" },
  { id: "hinglish", label: "Hinglish" },
];

function formatInr(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function sourceFingerprint(plan: CatalogPlan) {
  return JSON.stringify({
    t: plan.tagline || "",
    d: plan.details || "",
    i: plan.inclusions || [],
  });
}

export function MembershipPlansPage() {
  const user = useAuthStore((s) => s.user);
  const storeBranchId = useBranchStore((s) => s.activeBranchId);
  const activeBranchId = String(
    storeBranchId || user?.activeBranchId || user?.gymCodeId || "",
  ).trim();
  const isOwner = isMasterOwnerUser(user);
  const canView =
    isOwner ||
    canAccessSection(user, "Members") ||
    hasAccess(user, "settings", "managePlans");
  const canEdit = isOwner || hasAccess(user, "settings", "managePlans");

  const [loading, setLoading] = useState(true);
  const [masterEnabled, setMasterEnabled] = useState(true);
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [branchLabel, setBranchLabel] = useState("");
  const [branchRequired, setBranchRequired] = useState(false);
  const [editingPlanName, setEditingPlanName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<CatalogPlan | null>(null);

  const [explainLang, setExplainLang] = useState<ExplainLanguage>("original");
  const [explainBusy, setExplainBusy] = useState(false);
  /** Cache: planName → language → fingerprint → fields */
  const [explainCache, setExplainCache] = useState<
    Record<string, Partial<Record<ExplainLanguage, { fp: string; fields: ExplainFields }>>>
  >({});

  const load = async () => {
    setLoading(true);
    setBranchRequired(false);
    try {
      const data = await apiFetch<CatalogResponse>("/membership-plans-catalog");
      setMasterEnabled(data.masterEnabled !== false);
      setBranchLabel(
        data.branchLabel ||
          (data.branchName && data.gymCode
            ? `${data.branchName} (${data.gymCode})`
            : data.branchName || data.gymCode || ""),
      );
      setBranchRequired(Boolean(data.branchRequired));
      const list = Array.isArray(data.plans) ? data.plans : [];
      setPlans(
        list.map((p) => ({
          ...p,
          details: p.details || "",
          inclusions: [...(p.inclusions || [])],
          tagline: p.tagline || "",
        })),
      );
      setEditingPlanName(null);
      setDraft(null);
      setExplainLang("original");
      setExplainCache({});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not load plans";
      if (/select a gym branch|gym-code-id-required|branch-scope/i.test(msg)) {
        setBranchRequired(true);
        setPlans([]);
        setBranchLabel("");
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) void load();
    // Reload when staff/owner switches active branch in the shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional branch key
  }, [canView, activeBranchId]);

  const visibleCards = useMemo(() => {
    if (canEdit && !masterEnabled) return plans;
    if (!masterEnabled) return [];
    if (canEdit) return plans;
    return plans.filter((p) => p.isEnabled !== false);
  }, [plans, masterEnabled, canEdit]);

  const translatePlan = async (plan: CatalogPlan, language: ExplainLanguage) => {
    if (language === "original") return null;
    const fp = sourceFingerprint(plan);
    const hit = explainCache[plan.planName]?.[language];
    if (hit && hit.fp === fp) return hit.fields;

    const res = await apiFetch<{
      ok?: boolean;
      tagline?: string;
      details?: string;
      inclusions?: string[];
    }>("/membership-plans-catalog/explain-translate", {
      method: "POST",
      body: JSON.stringify({
        language,
        tagline: plan.tagline || "",
        details: plan.details || "",
        inclusions: plan.inclusions || [],
      }),
    });
    const fields: ExplainFields = {
      tagline: String(res.tagline || ""),
      details: String(res.details || ""),
      inclusions: Array.isArray(res.inclusions)
        ? res.inclusions.map((s) => String(s || ""))
        : [],
    };
    setExplainCache((prev) => ({
      ...prev,
      [plan.planName]: {
        ...(prev[plan.planName] || {}),
        [language]: { fp, fields },
      },
    }));
    return fields;
  };

  const changeExplainLang = async (next: ExplainLanguage) => {
    if (next === explainLang) return;
    if (next === "original") {
      setExplainLang("original");
      return;
    }
    if (editingPlanName) {
      toast.message("Exit edit mode to use Explain-in languages.");
      return;
    }
    const targets = visibleCards.filter(
      (p) =>
        String(p.tagline || "").trim() ||
        String(p.details || "").trim() ||
        (p.inclusions || []).some((x) => String(x || "").trim()),
    );
    if (!targets.length) {
      setExplainLang(next);
      toast.message("Add plan details first — nothing to translate yet.");
      return;
    }
    setExplainBusy(true);
    try {
      for (const plan of targets) {
        const fp = sourceFingerprint(plan);
        const hit = explainCache[plan.planName]?.[next];
        if (hit && hit.fp === fp) continue;
        await translatePlan(plan, next);
      }
      setExplainLang(next);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Could not translate. Showing original text.",
      );
      setExplainLang("original");
    } finally {
      setExplainBusy(false);
    }
  };

  const displayFieldsFor = (plan: CatalogPlan): ExplainFields => {
    if (explainLang === "original") {
      return {
        tagline: plan.tagline || "",
        details: plan.details || "",
        inclusions: plan.inclusions || [],
      };
    }
    const hit = explainCache[plan.planName]?.[explainLang];
    if (hit && hit.fp === sourceFingerprint(plan)) return hit.fields;
    return {
      tagline: plan.tagline || "",
      details: plan.details || "",
      inclusions: plan.inclusions || [],
    };
  };

  const startEdit = (plan: CatalogPlan) => {
    setExplainLang("original");
    setEditingPlanName(plan.planName);
    setDraft({
      ...plan,
      details: plan.details || "",
      inclusions: [...(plan.inclusions || [])],
      tagline: plan.tagline || "",
    });
  };

  const cancelEdit = () => {
    setEditingPlanName(null);
    setDraft(null);
  };

  const savePlan = async () => {
    if (!draft?.planName) return;
    setSaving(true);
    try {
      const res = await apiFetch<{ ok?: boolean; plan?: CatalogPlan }>(
        "/membership-plans-catalog",
        {
          method: "PUT",
          body: JSON.stringify({
            planName: draft.planName,
            listPriceInr: draft.listPriceInr,
            tagline: draft.tagline,
            details: draft.details,
            inclusions: draft.inclusions,
            isEnabled: draft.isEnabled,
            sortOrder: draft.sortOrder,
          }),
        },
      );
      toast.success(`Saved ${draft.planName}`);
      const saved = res.plan
        ? {
            ...res.plan,
            details: res.plan.details || "",
            inclusions: [...(res.plan.inclusions || [])],
          }
        : draft;
      setPlans((prev) =>
        prev.map((p) => (p.planName === draft.planName ? { ...p, ...saved } : p)),
      );
      setExplainCache((prev) => {
        const next = { ...prev };
        delete next[draft.planName];
        return next;
      });
      cancelEdit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save this plan");
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
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-800/80 dark:text-teal-300/90">
              Action Plus
            </p>
            <h1 className="mt-2 font-serif text-3xl tracking-tight text-slate-900 sm:text-4xl dark:text-slate-50">
              Membership Plans
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Staff sales showcase for this branch only — other gym branches never see these cards.
              Not shown on the Member Portal. Use Explain in to read plans aloud in another language
              (display only — saved text is never changed).
            </p>
            {branchLabel ? (
              <p className="mt-2 text-xs font-medium text-teal-800/90 dark:text-teal-300/90">
                Viewing · {branchLabel}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            {canEdit ? (
              <button
                type="button"
                role="switch"
                aria-checked={masterEnabled}
                disabled={saving}
                onClick={() => void toggleMaster(!masterEnabled)}
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
                  masterEnabled
                    ? "border-teal-700/30 bg-teal-50 text-teal-900 dark:border-teal-500/40 dark:bg-teal-950/40 dark:text-teal-100"
                    : "border-slate-300 bg-white text-slate-600 dark:border-border dark:bg-muted",
                )}
              >
                Showcase {masterEnabled ? "On" : "Off"}
              </button>
            ) : null}
            {!branchRequired && !editingPlanName ? (
              <div className="rounded-2xl border border-slate-200/90 bg-white/90 p-2 dark:border-border dark:bg-card/80">
                <p className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Explain in {explainBusy ? "· translating…" : ""}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {EXPLAIN_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={explainBusy}
                      onClick={() => void changeExplainLang(opt.id)}
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium transition",
                        explainLang === opt.id
                          ? "bg-slate-900 text-white dark:bg-teal-600"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-muted dark:text-slate-200",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </header>

        {branchRequired ? (
          <EmptyState
            title="Select a gym branch"
            description="Use the branch switcher in the header to choose a branch. Each branch has its own membership plan showcase."
          />
        ) : null}

        {!branchRequired && !masterEnabled && !canEdit ? (
          <EmptyState
            title="Plans showcase is turned off"
            description="Ask the owner to turn Showcase On."
          />
        ) : null}

        {!branchRequired && !plans.length ? (
          <EmptyState
            title="No plan names yet for this branch"
            description="Add plan names under Settings → Business Configuration → Plans while this branch is selected, then return here to add price and details."
          />
        ) : null}

        {editingPlanName && draft && !branchRequired ? (
          <article className="rounded-3xl border border-teal-200/80 bg-white p-6 shadow-sm dark:border-teal-900/40 dark:bg-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-serif text-2xl text-slate-900 dark:text-slate-50">
                  Edit · {draft.planName}
                </h2>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Editing always uses the original saved language (not Explain-in).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Show on showcase</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={draft.isEnabled !== false}
                  disabled={saving}
                  onClick={() =>
                    setDraft((d) =>
                      d ? { ...d, isEnabled: !(d.isEnabled !== false) } : d,
                    )
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
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
                    setDraft((d) =>
                      d ? { ...d, listPriceInr: v === "" ? null : Number(v) } : d,
                    );
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
                    setDraft((d) => (d ? { ...d, tagline: e.target.value } : d))
                  }
                />
              </div>
            </div>

            <div className="mt-4">
              <Label>Full plan details</Label>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Write the complete plan for staff to explain to customers (max 8,000 characters).
                Not shown on Member Portal.
              </p>
              <textarea
                className="mt-1 min-h-[220px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring"
                maxLength={8000}
                value={draft.details || ""}
                onChange={(e) =>
                  setDraft((d) => (d ? { ...d, details: e.target.value } : d))
                }
                placeholder="Describe what this plan includes, duration, benefits, fine print…"
              />
            </div>

            <div className="mt-4">
              <Label>Quick checklist (optional, one per line)</Label>
              <textarea
                className="mt-1 min-h-[100px] w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={(draft.inclusions || []).join("\n")}
                onChange={(e) =>
                  setDraft((d) =>
                    d
                      ? {
                          ...d,
                          inclusions: e.target.value
                            .split("\n")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        }
                      : d,
                  )
                }
                placeholder={"Gym floor access\nLocker\n…"}
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button size="sm" disabled={saving} onClick={() => void savePlan()}>
                {saving ? "Saving…" : "Save plan"}
              </Button>
              <Button size="sm" variant="outline" disabled={saving} onClick={cancelEdit}>
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
            </div>
          </article>
        ) : null}

        {!editingPlanName && !branchRequired && visibleCards.length ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visibleCards.map((plan, index) => {
              const price = formatInr(plan.listPriceInr);
              const shown = displayFieldsFor(plan);
              const detailsText = String(shown.details || "").trim();
              const inclusions = shown.inclusions?.length ? shown.inclusions : [];
              const tagline = String(shown.tagline || "").trim();
              const hidden = plan.isEnabled === false;
              return (
                <article
                  key={plan.planName}
                  className={cn(
                    "group relative flex flex-col rounded-3xl border bg-white/95 p-6 shadow-[0_18px_50px_-28px_rgba(15,23,42,0.35)] transition duration-300 hover:-translate-y-0.5 dark:bg-card",
                    hidden
                      ? "border-dashed border-slate-300 dark:border-border"
                      : "border-slate-200/90 dark:border-border",
                  )}
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  {canEdit ? (
                    <button
                      type="button"
                      className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 dark:border-border dark:bg-card dark:hover:bg-muted"
                      aria-label={`Edit ${plan.planName}`}
                      onClick={() => startEdit(plan)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  ) : null}

                  <div className="flex items-baseline justify-between gap-3 pr-10">
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
                  {explainLang !== "original" ? (
                    <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                      Explain view · not saved
                    </p>
                  ) : null}
                  {hidden && canEdit ? (
                    <p className="mt-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                      Hidden from showcase
                    </p>
                  ) : null}
                  {tagline ? (
                    <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      {tagline}
                    </p>
                  ) : null}
                  {detailsText ? (
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                      {detailsText}
                    </p>
                  ) : null}
                  {inclusions.length ? (
                    <ul className="mt-5 space-y-2.5">
                      {inclusions.map((item, i) => (
                        <li
                          key={`${plan.planName}-${i}-${item.slice(0, 24)}`}
                          className="flex gap-2.5 text-sm text-slate-700 dark:text-slate-200"
                        >
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-200">
                            <Check className="h-3 w-3" />
                          </span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  ) : !detailsText ? (
                    <p className="mt-5 text-sm text-slate-500">
                      Details coming soon — ask the team for the latest plan info.
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : null}

        {!editingPlanName &&
        !branchRequired &&
        masterEnabled &&
        canEdit &&
        !plans.some((p) => p.isEnabled !== false) &&
        plans.length ? (
          <EmptyState
            title="No plans visible on showcase"
            description="Open a plan with the pencil and turn on “Show on showcase”."
          />
        ) : null}
      </div>
    </div>
  );
}
