"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Moon, Settings2, Sun } from "lucide-react";
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

  const canFine = hasAccess(user, "settings", "manageFineRule");
  const followSystemTheme = themeReady && theme === "system";
  const activeAppearance = themeReady && resolvedTheme === "dark" ? "Night" : "Day";

  const flags = useMemo(
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
    mutationFn: (patch: Partial<AppSettings>) => settingsApi.bulk(patch),
    onSuccess: async () => {
      toast.success("Settings saved");
      await qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
              <div className="space-y-3 rounded-2xl border border-sky-100 bg-sky-50/40 p-4 dark:border-sky-900 dark:bg-sky-950/20">
                <div>
                  <h3 className="text-sm font-semibold">Gym Codes (Branches)</h3>
                  <p className="text-xs text-muted-foreground">
                    Create branches, set display name / logo, and shift start for late-note detection.
                  </p>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  <Input
                    placeholder="Code (e.g. ADRA)"
                    value={gymForm.code}
                    onChange={(e) => setGymForm((f) => ({ ...f, code: e.target.value }))}
                  />
                  <Input
                    placeholder="Branch name"
                    value={gymForm.name}
                    onChange={(e) => setGymForm((f) => ({ ...f, name: e.target.value }))}
                  />
                  <Button
                    onClick={() => createGym.mutate()}
                    disabled={createGym.isPending || !gymForm.code.trim()}
                  >
                    Add branch
                  </Button>
                </div>
                {gymLoading ? (
                  <Skeleton className="h-20" />
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-border dark:bg-card">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-left text-xs dark:bg-muted">
                          <th className="px-3 py-2 font-semibold">Code</th>
                          <th className="px-3 py-2 font-semibold">Name</th>
                          <th className="px-3 py-2 font-semibold">Display / Logo</th>
                          <th className="px-3 py-2 font-semibold">Shift start</th>
                          <th className="px-3 py-2 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(gymCodes as GymCode[]).map((g) => {
                          const shift =
                            shiftDrafts[g.id] ??
                            String(g.shiftStartTime || g.shift_start_time || "");
                          const isHq = String(g.code || "").toUpperCase() === "HQ";
                          const brand = resolveClientBranchBranding(g);
                          const displayDraft =
                            brandingDrafts[g.id] ??
                            String(g.displayName || brand.displayName || "");
                          return (
                            <tr
                              key={g.id}
                              className="border-t border-slate-100 dark:border-border"
                            >
                              <td className="px-3 py-2 font-medium">{g.code || "—"}</td>
                              <td className="px-3 py-2">{g.name || g.label || "—"}</td>
                              <td className="px-3 py-2">
                                <div className="flex min-w-[220px] flex-col gap-2">
                                  <div className="flex items-center gap-2">
                                    <div className="h-9 w-9 overflow-hidden rounded-full ring-1 ring-border">
                                      <BranchLogo
                                        src={brand.logoUrl}
                                        alt={brand.displayName}
                                        className="h-full w-full"
                                      />
                                    </div>
                                    <Input
                                      className="h-8"
                                      value={displayDraft}
                                      onChange={(e) =>
                                        setBrandingDrafts((d) => ({
                                          ...d,
                                          [g.id]: e.target.value,
                                        }))
                                      }
                                      placeholder={brand.displayName}
                                    />
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <Button
                                      size="sm"
                                      variant="outline"
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
                                      <span className="inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-accent">
                                        Upload logo
                                      </span>
                                    </label>
                                    {!brand.usesDefaultLogo ? (
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-rose-700"
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
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1.5">
                                  <Input
                                    type="time"
                                    className="h-8 w-[120px]"
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
                              </td>
                              <td className="px-3 py-2">
                                {!isHq ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-rose-700"
                                    onClick={() => {
                                      if (confirm(`Delete branch ${g.code}?`)) {
                                        deleteGym.mutate(g.id);
                                      }
                                    }}
                                  >
                                    Delete
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground">HQ protected</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {!gymCodes.length ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-3 py-6 text-center text-sm text-muted-foreground"
                            >
                              No gym codes yet.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}

            {canFine ? (
              <div className="space-y-3 rounded-2xl border border-rose-100 bg-rose-50/30 p-4 dark:border-rose-900 dark:bg-rose-950/20">
                <div>
                  <h3 className="text-sm font-semibold">Fine SMS Rule</h3>
                  <p className="text-xs text-muted-foreground">
                    Controls Fine SMS eligibility and payment QR reminder append.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={flags.fineSmsEnabled}
                    onChange={(e) =>
                      saveFlags.mutate({ fineSmsEnabled: e.target.checked })
                    }
                  />
                  Enable Fine SMS rules
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-xs">Grace days</Label>
                  <Input
                    type="number"
                    className="h-8 w-24"
                    defaultValue={flags.fineSmsGraceDays}
                    onBlur={(e) => {
                      const n = Math.max(0, Number(e.target.value) || 0);
                      if (n !== flags.fineSmsGraceDays) {
                        saveFlags.mutate({ fineSmsGraceDays: n });
                      }
                    }}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={flags.paymentQrInReminderEnabled}
                    onChange={(e) =>
                      saveFlags.mutate({ paymentQrInReminderEnabled: e.target.checked })
                    }
                  />
                  Append Payment QR link on billing reminder messages
                </label>
              </div>
            ) : null}

            {isOwner ? (
              <div className="space-y-2 rounded-2xl border border-violet-100 bg-violet-50/30 p-4 dark:border-violet-900 dark:bg-violet-950/20">
                <h3 className="text-sm font-semibold">Feature flags</h3>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={flags.attendanceNotesEnabled}
                    onChange={(e) =>
                      saveFlags.mutate({ attendanceNotesEnabled: e.target.checked })
                    }
                  />
                  Enable Attendance late notes
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={flags.customTemplatesEnabled}
                    onChange={(e) =>
                      saveFlags.mutate({ customTemplatesEnabled: e.target.checked })
                    }
                  />
                  Enable Custom WhatsApp templates
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={flags.financeUseEstimatedExpense}
                    onChange={(e) =>
                      saveFlags.mutate({ financeUseEstimatedExpense: e.target.checked })
                    }
                  />
                  Finance: use 26% expense estimate when no expense rows
                </label>
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
