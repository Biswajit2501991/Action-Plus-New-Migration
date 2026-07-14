"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Moon,
  Settings2,
  Sun,
  Trash2,
} from "lucide-react";
import { PageHeader, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { BranchLogo } from "@/components/branding/branch-logo";
import { useGymCodes, useSettings } from "@/hooks/use-data";
import { gymCodesApi, settingsApi } from "@/services/api";
import { resolveClientBranchBranding } from "@/lib/domain/branch-branding";
import { hasAccess, isMasterOwnerUser } from "@/lib/domain/permissions";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores";
import type { AppSettings, GymCode } from "@/types";

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}

function SettingsToggle({
  checked,
  onChange,
  disabled,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-black/[0.06] bg-white/80 px-3.5 py-3 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description ? (
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors",
          checked ? "bg-slate-900 dark:bg-teal-600" : "bg-slate-300 dark:bg-slate-600",
          disabled && "opacity-50",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform",
            checked && "translate-x-5",
          )}
        />
      </button>
    </div>
  );
}

type FeatureFlagState = {
  attendanceNotesEnabled: boolean;
  customTemplatesEnabled: boolean;
  fineSmsEnabled: boolean;
  fineSmsGraceDays: number;
  paymentQrInReminderEnabled: boolean;
  financeUseEstimatedExpense: boolean;
};

function buildFeatureFlagPatch(
  current: FeatureFlagState,
  override: Partial<FeatureFlagState>,
): FeatureFlagState {
  return {
    attendanceNotesEnabled: override.attendanceNotesEnabled ?? current.attendanceNotesEnabled,
    customTemplatesEnabled: override.customTemplatesEnabled ?? current.customTemplatesEnabled,
    fineSmsEnabled: override.fineSmsEnabled ?? current.fineSmsEnabled,
    fineSmsGraceDays: override.fineSmsGraceDays ?? current.fineSmsGraceDays,
    paymentQrInReminderEnabled:
      override.paymentQrInReminderEnabled ?? current.paymentQrInReminderEnabled,
    financeUseEstimatedExpense:
      override.financeUseEstimatedExpense ?? current.financeUseEstimatedExpense,
  };
}

type LookupKey =
  | "plans"
  | "statuses"
  | "paymentMethods"
  | "expenseCategories"
  | "holdDurations"
  | "genders"
  | "exerciseTypes";

const BUSINESS_LOOKUPS: {
  key: LookupKey;
  label: string;
  description: string;
  permission: string;
}[] = [
  {
    key: "plans",
    label: "Plans",
    description: "Membership plan names used on Members and Finance.",
    permission: "managePlans",
  },
  {
    key: "statuses",
    label: "Statuses",
    description: "Member status values (Active, Hold, …).",
    permission: "manageStatuses",
  },
  {
    key: "paymentMethods",
    label: "Payment methods",
    description: "Cash, UPI, Card, and other collection methods.",
    permission: "managePaymentMethods",
  },
  {
    key: "expenseCategories",
    label: "Expense categories",
    description: "Categories for Finance expense rows.",
    permission: "manageExpenseCategories",
  },
];

const MEMBER_LOOKUPS: {
  key: LookupKey;
  label: string;
  description: string;
  permission: string;
}[] = [
  {
    key: "holdDurations",
    label: "Hold durations",
    description: "Hold lengths offered when placing a member on Hold.",
    permission: "manageHoldDurations",
  },
  {
    key: "genders",
    label: "Genders",
    description: "Gender options on member profiles.",
    permission: "manageGenders",
  },
  {
    key: "exerciseTypes",
    label: "Exercise types",
    description: "PT exercise type lookups.",
    permission: "managePlans",
  },
];

function lookupValues(settings: AppSettings | undefined, key: LookupKey) {
  const raw = settings?.[key];
  return Array.isArray(raw) ? (raw as string[]) : [];
}

function AppearanceCard({
  followSystemTheme,
  activeAppearance,
  themeReady,
  resolvedTheme,
  open,
  onToggleOpen,
  onFollowSystem,
  onSetTheme,
}: {
  followSystemTheme: boolean;
  activeAppearance: string;
  themeReady: boolean;
  resolvedTheme?: string;
  open: boolean;
  onToggleOpen: () => void;
  onFollowSystem: (on: boolean) => void;
  onSetTheme: (theme: string) => void;
}) {
  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm dark:border-border">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-3 text-left dark:border-border dark:from-muted/40 dark:to-card"
        onClick={onToggleOpen}
      >
        <div className="flex items-center gap-2">
          <Sun className="h-4 w-4 text-slate-500 dark:hidden" />
          <Moon className="hidden h-4 w-4 text-slate-500 dark:block" />
          <div>
            <div className="text-sm font-semibold">Appearance</div>
            <div className="text-xs text-muted-foreground">Day / Night theme for this device</div>
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open ? (
        <CardContent className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-border dark:bg-card">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Auto Day / Night</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Match this laptop or phone’s system light/dark setting. When off, use Day/Night
                below or the header button to pick manually.
              </p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Currently showing{" "}
                <span className="font-semibold text-foreground">{activeAppearance}</span>
                {followSystemTheme ? " · following system" : " · manual"}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={followSystemTheme}
              aria-label="Auto Day Night from system"
              disabled={!themeReady}
              onClick={() => onFollowSystem(!followSystemTheme)}
              className={cn(
                "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                followSystemTheme
                  ? "bg-slate-900 dark:bg-teal-600"
                  : "bg-slate-300 dark:bg-slate-600",
                !themeReady && "opacity-50",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform",
                  followSystemTheme && "translate-x-5",
                )}
              />
            </button>
          </div>
          {!followSystemTheme ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={resolvedTheme === "light" ? "default" : "secondary"}
                size="sm"
                onClick={() => onSetTheme("light")}
              >
                <Sun className="h-3.5 w-3.5" />
                Day
              </Button>
              <Button
                type="button"
                variant={resolvedTheme === "dark" ? "default" : "secondary"}
                size="sm"
                onClick={() => onSetTheme("dark")}
              >
                <Moon className="h-3.5 w-3.5" />
                Night
              </Button>
            </div>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { data: settings, isLoading } = useSettings();
  const { data: gymCodes = [], isLoading: gymLoading } = useGymCodes();
  const isOwner = isMasterOwnerUser(user);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    setThemeReady(true);
  }, []);

  const [openCat, setOpenCat] = useState<Record<string, boolean>>({
    appearance: true,
    branch: true,
    business: true,
    member: true,
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [gymForm, setGymForm] = useState({ code: "", name: "" });
  const [shiftDrafts, setShiftDrafts] = useState<Record<string, string>>({});
  const [brandingDrafts, setBrandingDrafts] = useState<Record<string, string>>({});
  const [expandedGymId, setExpandedGymId] = useState<string | null>(null);

  const canFine = hasAccess(user, "settings", "manageFineRule");
  const followSystemTheme = themeReady && theme === "system";
  const activeAppearance = themeReady && resolvedTheme === "dark" ? "Night" : "Day";

  const flags = useMemo<FeatureFlagState>(
    () => ({
      attendanceNotesEnabled: settings?.attendanceNotesEnabled === true,
      customTemplatesEnabled: settings?.customTemplatesEnabled === true,
      fineSmsEnabled: settings?.fineSmsEnabled !== false,
      fineSmsGraceDays: Number(settings?.fineSmsGraceDays ?? 0) || 0,
      paymentQrInReminderEnabled: settings?.paymentQrInReminderEnabled === true,
      financeUseEstimatedExpense: settings?.financeUseEstimatedExpense !== false,
    }),
    [settings],
  );

  const addLookup = useMutation({
    mutationFn: ({ category, value }: { category: string; value: string }) =>
      settingsApi.addLookup(category, value),
    onSuccess: async () => {
      toast.success("Added");
      await qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delLookup = useMutation({
    mutationFn: ({ category, value }: { category: string; value: string }) =>
      settingsApi.deleteLookup(category, value),
    onSuccess: async () => {
      toast.success("Removed");
      await qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not remove (may be in use)"),
  });

  const saveFlags = useMutation({
    mutationFn: (patch: FeatureFlagState) => settingsApi.bulk(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ["settings"] });
      const previous = qc.getQueriesData<AppSettings>({ queryKey: ["settings"] });
      qc.setQueriesData<AppSettings>({ queryKey: ["settings"] }, (old) =>
        old ? { ...old, ...patch } : old,
      );
      return { previous };
    },
    onError: (e: Error, _patch, ctx) => {
      ctx?.previous?.forEach(([key, data]) => {
        qc.setQueryData(key, data);
      });
      toast.error(e.message);
    },
    onSuccess: async () => {
      toast.success("Settings saved");
      await qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  const setFeatureFlags = (override: Partial<FeatureFlagState>) => {
    const cached =
      qc.getQueryData<AppSettings>(["settings", "default"]) ||
      qc.getQueriesData<AppSettings>({ queryKey: ["settings"] }).find(([, v]) => v)?.[1];
    const current: FeatureFlagState = cached
      ? {
          attendanceNotesEnabled: cached.attendanceNotesEnabled === true,
          customTemplatesEnabled: cached.customTemplatesEnabled === true,
          fineSmsEnabled: cached.fineSmsEnabled !== false,
          fineSmsGraceDays: Number(cached.fineSmsGraceDays ?? 0) || 0,
          paymentQrInReminderEnabled: cached.paymentQrInReminderEnabled === true,
          financeUseEstimatedExpense: cached.financeUseEstimatedExpense !== false,
        }
      : flags;
    saveFlags.mutate(buildFeatureFlagPatch(current, override));
  };

  const createGym = useMutation({
    mutationFn: () =>
      gymCodesApi.create({
        code: gymForm.code.trim().toUpperCase(),
        name: gymForm.name.trim() || gymForm.code.trim(),
      }),
    onSuccess: async () => {
      toast.success("Branch created");
      setGymForm({ code: "", name: "" });
      await qc.invalidateQueries({ queryKey: ["gym-codes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateShift = useMutation({
    mutationFn: ({ id, shiftStartTime }: { id: string; shiftStartTime: string }) =>
      gymCodesApi.updateShift(id, {
        shiftStartTime: shiftStartTime || null,
        shiftTimezone: "IST",
      }),
    onSuccess: async () => {
      toast.success("Shift updated");
      await qc.invalidateQueries({ queryKey: ["gym-codes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteGym = useMutation({
    mutationFn: (id: string) => gymCodesApi.remove(id),
    onSuccess: async () => {
      toast.success("Branch deleted");
      await qc.invalidateQueries({ queryKey: ["gym-codes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveBranding = useMutation({
    mutationFn: async ({
      id,
      displayName,
      logoDataUrl,
      clearLogo,
    }: {
      id: string;
      displayName?: string;
      logoDataUrl?: string;
      clearLogo?: boolean;
    }) => {
      await gymCodesApi.updateBranding(id, {
        displayName,
        clearLogo: Boolean(clearLogo),
      });
      if (logoDataUrl) {
        await gymCodesApi.uploadLogo(id, logoDataUrl);
      }
    },
    onSuccess: async () => {
      toast.success("Branding saved");
      await qc.invalidateQueries({ queryKey: ["gym-codes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleCat = (key: string) =>
    setOpenCat((prev) => ({ ...prev, [key]: !prev[key] }));

  const renderLookupCard = (cat: {
    key: LookupKey;
    label: string;
    description: string;
    permission: string;
  }) => {
    if (!hasAccess(user, "settings", cat.permission)) return null;
    const values = lookupValues(settings, cat.key);
    return (
      <div
        key={cat.key}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-border dark:bg-card"
      >
        <div className="mb-2">
          <h3 className="text-sm font-semibold">{cat.label}</h3>
          <p className="text-xs text-muted-foreground">{cat.description}</p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder={`Add ${cat.label.toLowerCase()}`}
            value={drafts[cat.key] || ""}
            onChange={(e) => setDrafts((d) => ({ ...d, [cat.key]: e.target.value }))}
          />
          <Button
            onClick={() => {
              const value = (drafts[cat.key] || "").trim();
              if (!value) return;
              addLookup.mutate({ category: cat.key, value });
              setDrafts((d) => ({ ...d, [cat.key]: "" }));
            }}
          >
            Add
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {values.map((v) => (
            <button
              key={v}
              type="button"
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs hover:border-rose-300 hover:bg-rose-50 dark:border-border"
              onClick={() => delLookup.mutate({ category: cat.key, value: v })}
              title="Remove"
            >
              {v} ×
            </button>
          ))}
          {!values.length ? (
            <span className="text-xs text-muted-foreground">No values yet.</span>
          ) : null}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Settings"
          description="Appearance, branches, lookups, Fine SMS rules, and feature flags."
        />
        <AppearanceCard
          followSystemTheme={followSystemTheme}
          activeAppearance={activeAppearance}
          themeReady={themeReady}
          resolvedTheme={resolvedTheme}
          open={openCat.appearance !== false}
          onToggleOpen={() => toggleCat("appearance")}
          onFollowSystem={(on) => {
            if (on) setTheme("system");
            else setTheme(resolvedTheme === "dark" ? "dark" : "light");
          }}
          onSetTheme={setTheme}
        />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Appearance, branches, lookups, Fine SMS rules, and feature flags."
      />

      <AppearanceCard
        followSystemTheme={followSystemTheme}
        activeAppearance={activeAppearance}
        themeReady={themeReady}
        resolvedTheme={resolvedTheme}
        open={openCat.appearance !== false}
        onToggleOpen={() => toggleCat("appearance")}
        onFollowSystem={(on) => {
          if (on) setTheme("system");
          else setTheme(resolvedTheme === "dark" ? "dark" : "light");
        }}
        onSetTheme={setTheme}
      />

      {/* Branch & System */}
      <Card className="overflow-hidden border-slate-200 shadow-sm dark:border-border">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-3 text-left dark:border-border dark:from-muted/40 dark:to-card"
          onClick={() => toggleCat("branch")}
        >
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-slate-500" />
            <div>
              <div className="text-sm font-semibold">Branch & System</div>
              <div className="text-xs text-muted-foreground">
                Gym codes, Fine SMS, attendance notes, templates
              </div>
            </div>
          </div>
          {openCat.branch ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {openCat.branch ? (
          <CardContent className="space-y-4 p-4">
            {isOwner ? (
              <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/80 to-white p-4 shadow-sm dark:border-border dark:from-white/[0.04] dark:to-card">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight">Gym Codes (Branches)</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      One line per branch — expand to edit display name and logo.
                    </p>
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                  <Input
                    placeholder="Code (e.g. ADRA)"
                    value={gymForm.code}
                    onChange={(e) => setGymForm((f) => ({ ...f, code: e.target.value }))}
                    className="h-10 rounded-xl"
                  />
                  <Input
                    placeholder="Branch name"
                    value={gymForm.name}
                    onChange={(e) => setGymForm((f) => ({ ...f, name: e.target.value }))}
                    className="h-10 rounded-xl"
                  />
                  <Button
                    onClick={() => createGym.mutate()}
                    disabled={createGym.isPending || !gymForm.code.trim()}
                    className="h-10 rounded-xl"
                  >
                    Add branch
                  </Button>
                </div>

                {gymLoading ? (
                  <Skeleton className="h-24" />
                ) : (
                  <div className="space-y-2">
                    {(gymCodes as GymCode[]).map((g) => {
                      const shift =
                        shiftDrafts[g.id] ?? String(g.shiftStartTime || g.shift_start_time || "");
                      const isHq = String(g.code || "").toUpperCase() === "HQ";
                      const brand = resolveClientBranchBranding(g);
                      const displayDraft =
                        brandingDrafts[g.id] ?? String(g.displayName || brand.displayName || "");
                      const isExpanded = expandedGymId === g.id;
                      return (
                        <div
                          key={g.id}
                          className={cn(
                            "overflow-hidden rounded-2xl border border-black/[0.06] bg-white/90 shadow-sm transition dark:border-white/10 dark:bg-white/[0.03]",
                            isExpanded && "ring-1 ring-slate-300/70 dark:ring-teal-500/30",
                          )}
                        >
                          <div className="flex items-center gap-3 px-3.5 py-2.5">
                            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-border">
                              <BranchLogo
                                src={brand.logoUrl}
                                alt={brand.displayName}
                                className="h-full w-full"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span className="font-semibold tracking-wide text-foreground">
                                  {g.code || "—"}
                                </span>
                                <span className="truncate text-sm text-muted-foreground">
                                  {g.name || g.label || "—"}
                                </span>
                              </div>
                            </div>
                            <div className="hidden items-center gap-1.5 sm:flex">
                              <Input
                                type="time"
                                className="h-8 w-[118px] rounded-lg"
                                value={shift}
                                onChange={(e) =>
                                  setShiftDrafts((d) => ({
                                    ...d,
                                    [g.id]: e.target.value,
                                  }))
                                }
                                aria-label={`Shift start for ${g.code}`}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-lg"
                                onClick={() =>
                                  updateShift.mutate({
                                    id: g.id,
                                    shiftStartTime: shift,
                                  })
                                }
                              >
                                Save
                              </Button>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedGymId((prev) => (prev === g.id ? null : g.id))
                              }
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/80 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                              aria-expanded={isExpanded}
                              aria-label={
                                isExpanded
                                  ? `Collapse branding for ${g.code}`
                                  : `Expand branding for ${g.code}`
                              }
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </button>
                            {!isHq ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:hover:bg-rose-950/40"
                                onClick={() => {
                                  if (confirm(`Delete branch ${g.code}?`)) {
                                    deleteGym.mutate(g.id);
                                  }
                                }}
                                aria-label={`Delete ${g.code}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            ) : (
                              <span className="hidden text-[10px] font-medium uppercase tracking-wide text-muted-foreground sm:inline">
                                HQ
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 border-t border-black/[0.04] px-3.5 py-2 sm:hidden dark:border-white/8">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              Shift
                            </span>
                            <Input
                              type="time"
                              className="h-8 flex-1 rounded-lg"
                              value={shift}
                              onChange={(e) =>
                                setShiftDrafts((d) => ({
                                  ...d,
                                  [g.id]: e.target.value,
                                }))
                              }
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-lg"
                              onClick={() =>
                                updateShift.mutate({
                                  id: g.id,
                                  shiftStartTime: shift,
                                })
                              }
                            >
                              Save
                            </Button>
                          </div>

                          {isExpanded ? (
                            <div className="space-y-3 border-t border-black/[0.06] bg-slate-50/60 px-3.5 py-3.5 dark:border-white/10 dark:bg-white/[0.02]">
                              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                                Display name & logo
                              </p>
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <Input
                                  className="h-10 rounded-xl"
                                  value={displayDraft}
                                  onChange={(e) =>
                                    setBrandingDrafts((d) => ({
                                      ...d,
                                      [g.id]: e.target.value,
                                    }))
                                  }
                                  placeholder={brand.displayName}
                                />
                                <div className="flex flex-wrap gap-1.5">
                                  <Button
                                    size="sm"
                                    className="h-9 rounded-xl"
                                    disabled={saveBranding.isPending}
                                    onClick={() =>
                                      saveBranding.mutate({
                                        id: g.id,
                                        displayName: displayDraft,
                                      })
                                    }
                                  >
                                    Save name
                                  </Button>
                                  <label className="inline-flex cursor-pointer">
                                    <span className="sr-only">Upload logo</span>
                                    <input
                                      type="file"
                                      accept="image/png,image/jpeg,image/webp,image/gif"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        e.target.value = "";
                                        if (!file) return;
                                        void (async () => {
                                          try {
                                            const dataUrl = await readFileAsDataUrl(file);
                                            saveBranding.mutate({
                                              id: g.id,
                                              displayName: displayDraft,
                                              logoDataUrl: dataUrl,
                                            });
                                          } catch (err) {
                                            toast.error(
                                              err instanceof Error
                                                ? err.message
                                                : "Logo upload failed",
                                            );
                                          }
                                        })();
                                      }}
                                    />
                                    <span className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-white px-3 text-xs font-semibold hover:bg-accent dark:bg-background">
                                      <ImagePlus className="h-3.5 w-3.5" />
                                      Upload logo
                                    </span>
                                  </label>
                                  {!brand.usesDefaultLogo ? (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-9 rounded-xl text-rose-700"
                                      disabled={saveBranding.isPending}
                                      onClick={() =>
                                        saveBranding.mutate({
                                          id: g.id,
                                          displayName: displayDraft,
                                          clearLogo: true,
                                        })
                                      }
                                    >
                                      Clear logo
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    {!gymCodes.length ? (
                      <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                        No gym codes yet.
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            {canFine ? (
              <div className="space-y-3 rounded-2xl border border-rose-200/70 bg-gradient-to-b from-rose-50/50 to-white p-4 dark:border-rose-900/50 dark:from-rose-950/20 dark:to-card">
                <div>
                  <h3 className="text-sm font-semibold">Fine SMS Rule</h3>
                  <p className="text-xs text-muted-foreground">
                    Controls Fine SMS eligibility and payment QR reminder append.
                  </p>
                </div>
                <SettingsToggle
                  checked={flags.fineSmsEnabled}
                  label="Enable Fine SMS rules"
                  description="Apply Fine SMS eligibility based on grace days and roles."
                  onChange={(next) => setFeatureFlags({ fineSmsEnabled: next })}
                />
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/[0.06] bg-white/80 px-3.5 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                  <Label className="text-xs">Grace days</Label>
                  <Input
                    type="number"
                    className="h-8 w-24 rounded-lg"
                    defaultValue={flags.fineSmsGraceDays}
                    onBlur={(e) => {
                      const n = Math.max(0, Number(e.target.value) || 0);
                      if (n !== flags.fineSmsGraceDays) {
                        setFeatureFlags({ fineSmsGraceDays: n });
                      }
                    }}
                  />
                </div>
                <SettingsToggle
                  checked={flags.paymentQrInReminderEnabled}
                  label="Payment QR on billing reminders"
                  description="Append Payment QR link on billing reminder messages."
                  onChange={(next) => setFeatureFlags({ paymentQrInReminderEnabled: next })}
                />
              </div>
            ) : null}

            {isOwner ? (
              <div className="space-y-3 rounded-2xl border border-violet-200/70 bg-gradient-to-b from-violet-50/40 to-white p-4 dark:border-violet-900/40 dark:from-violet-950/20 dark:to-card">
                <div>
                  <h3 className="text-sm font-semibold">Feature flags</h3>
                  <p className="text-xs text-muted-foreground">
                    Turn on as many as you need — each save keeps all other flags.
                  </p>
                </div>
                <SettingsToggle
                  checked={flags.attendanceNotesEnabled}
                  label="Attendance late notes"
                  description="Allow staff to submit late-arrival notes on Attendance."
                  onChange={(next) => setFeatureFlags({ attendanceNotesEnabled: next })}
                />
                <SettingsToggle
                  checked={flags.customTemplatesEnabled}
                  label="Custom WhatsApp templates"
                  description="Enable branch custom templates on WhatsApp SMS."
                  onChange={(next) => setFeatureFlags({ customTemplatesEnabled: next })}
                />
                <SettingsToggle
                  checked={flags.financeUseEstimatedExpense}
                  label="Finance 26% expense estimate"
                  description="Use estimated expense when no expense rows exist."
                  onChange={(next) => setFeatureFlags({ financeUseEstimatedExpense: next })}
                />
              </div>
            ) : null}
          </CardContent>
        ) : null}
      </Card>

      {/* Business Configuration */}
      <Card className="overflow-hidden border-slate-200 shadow-sm dark:border-border">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-white px-4 py-3 text-left dark:border-border dark:from-emerald-950/20 dark:to-card"
          onClick={() => toggleCat("business")}
        >
          <div>
            <div className="text-sm font-semibold">Business Configuration</div>
            <div className="text-xs text-muted-foreground">
              Plans, statuses, payment methods, expense categories
            </div>
          </div>
          {openCat.business ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>
        {openCat.business ? (
          <CardContent className="grid gap-3 p-4 lg:grid-cols-2">
            {BUSINESS_LOOKUPS.map(renderLookupCard)}
          </CardContent>
        ) : null}
      </Card>

      {/* Member & PT */}
      <Card className="overflow-hidden border-slate-200 shadow-sm dark:border-border">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-white px-4 py-3 text-left dark:border-border dark:from-amber-950/20 dark:to-card"
          onClick={() => toggleCat("member")}
        >
          <div>
            <div className="text-sm font-semibold">Member & PT</div>
            <div className="text-xs text-muted-foreground">
              Hold durations, genders, exercise types
            </div>
          </div>
          {openCat.member ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {openCat.member ? (
          <CardContent className="grid gap-3 p-4 lg:grid-cols-2">
            {MEMBER_LOOKUPS.map(renderLookupCard)}
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
