"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Building2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Download,
  HardDrive,
  ImagePlus,
  MessageSquareWarning,
  Moon,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Users,
  KeyRound,
} from "lucide-react";
import { PageHeader, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { BranchLogo } from "@/components/branding/branch-logo";
import { useGymCodes, useSettings } from "@/hooks/use-data";
import { attendanceKioskApi, gymCodesApi, settingsApi } from "@/services/api";
import { apiFetch } from "@/services/api/client";
import { resolveClientBranchBranding } from "@/lib/domain/branch-branding";
import { hasAccess, isMasterOwnerUser } from "@/lib/domain/permissions";
import { cn, downloadTextFile } from "@/lib/utils";
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
  qrVisitorIntakeEnabled: boolean;
  attendanceRequirePresenceQr: boolean;
  customTemplatesEnabled: boolean;
  fineSmsEnabled: boolean;
  fineSmsGraceDays: number;
  paymentQrInReminderEnabled: boolean;
  financeUseEstimatedExpense: boolean;
};

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
    permission: "manageExerciseTypes",
  },
];

function lookupValues(settings: AppSettings | undefined, key: LookupKey) {
  const raw = settings?.[key];
  return Array.isArray(raw) ? (raw as string[]) : [];
}

function SettingsSectionShell({
  title,
  description,
  open,
  onToggle,
  accent,
  icon,
  children,
}: {
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  accent: {
    bar: string;
    header: string;
    iconWrap: string;
    icon: string;
    border: string;
  };
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("overflow-hidden shadow-sm", accent.border)}>
      <div className={cn("h-1 w-full", accent.bar)} />
      <button
        type="button"
        className={cn(
          "flex w-full items-center justify-between gap-3 border-b px-4 py-3.5 text-left",
          accent.header,
        )}
        onClick={onToggle}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
              accent.iconWrap,
            )}
          >
            <span className={accent.icon}>{icon}</span>
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight">{title}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
          </div>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open ? <CardContent className="space-y-4 p-4">{children}</CardContent> : null}
    </Card>
  );
}

const SECTION_ACCENTS = {
  appearance: {
    bar: "bg-gradient-to-r from-slate-400 to-slate-600",
    header:
      "border-slate-100 bg-gradient-to-r from-slate-50 to-white dark:border-border dark:from-slate-950/40 dark:to-card",
    iconWrap: "bg-slate-100 dark:bg-slate-800/80",
    icon: "text-slate-600 dark:text-slate-300",
    border: "border-slate-200/90 dark:border-border",
  },
  branches: {
    bar: "bg-gradient-to-r from-sky-400 to-teal-500",
    header:
      "border-sky-100/80 bg-gradient-to-r from-sky-50 via-teal-50/40 to-white dark:border-sky-900/40 dark:from-sky-950/30 dark:via-teal-950/20 dark:to-card",
    iconWrap: "bg-sky-100 dark:bg-sky-950/60",
    icon: "text-sky-700 dark:text-sky-300",
    border: "border-sky-200/80 dark:border-sky-900/40",
  },
  fine: {
    bar: "bg-gradient-to-r from-rose-400 to-orange-500",
    header:
      "border-rose-100/80 bg-gradient-to-r from-rose-50 via-orange-50/30 to-white dark:border-rose-900/40 dark:from-rose-950/30 dark:via-orange-950/15 dark:to-card",
    iconWrap: "bg-rose-100 dark:bg-rose-950/60",
    icon: "text-rose-700 dark:text-rose-300",
    border: "border-rose-200/80 dark:border-rose-900/40",
  },
  features: {
    bar: "bg-gradient-to-r from-violet-400 to-fuchsia-500",
    header:
      "border-violet-100/80 bg-gradient-to-r from-violet-50 via-fuchsia-50/30 to-white dark:border-violet-900/40 dark:from-violet-950/30 dark:via-fuchsia-950/15 dark:to-card",
    iconWrap: "bg-violet-100 dark:bg-violet-950/60",
    icon: "text-violet-700 dark:text-violet-300",
    border: "border-violet-200/80 dark:border-violet-900/40",
  },
  business: {
    bar: "bg-gradient-to-r from-emerald-400 to-teal-500",
    header:
      "border-emerald-100/80 bg-gradient-to-r from-emerald-50 to-white dark:border-emerald-900/40 dark:from-emerald-950/25 dark:to-card",
    iconWrap: "bg-emerald-100 dark:bg-emerald-950/60",
    icon: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200/80 dark:border-emerald-900/40",
  },
  member: {
    bar: "bg-gradient-to-r from-amber-400 to-orange-500",
    header:
      "border-amber-100/80 bg-gradient-to-r from-amber-50 to-white dark:border-amber-900/40 dark:from-amber-950/25 dark:to-card",
    iconWrap: "bg-amber-100 dark:bg-amber-950/60",
    icon: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200/80 dark:border-amber-900/40",
  },
  recovery: {
    bar: "bg-gradient-to-r from-indigo-400 to-sky-500",
    header:
      "border-indigo-100/80 bg-gradient-to-r from-indigo-50 to-white dark:border-indigo-900/40 dark:from-indigo-950/25 dark:to-card",
    iconWrap: "bg-indigo-100 dark:bg-indigo-950/60",
    icon: "text-indigo-700 dark:text-indigo-300",
    border: "border-indigo-200/80 dark:border-indigo-900/40",
  },
} as const;

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
    <SettingsSectionShell
      title="Appearance"
      description="Day / Night theme for this device"
      open={open}
      onToggle={onToggleOpen}
      accent={SECTION_ACCENTS.appearance}
      icon={
        <>
          <Sun className="h-4 w-4 dark:hidden" />
          <Moon className="hidden h-4 w-4 dark:block" />
        </>
      }
    >
      <div className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-border dark:bg-card">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Auto Day / Night</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Match this laptop or phone’s system light/dark setting. When off, use Day/Night below or
            the header button to pick manually.
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
            followSystemTheme ? "bg-slate-900 dark:bg-teal-600" : "bg-slate-300 dark:bg-slate-600",
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
    </SettingsSectionShell>
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
    appearance: false,
    branches: false,
    fine: false,
    features: false,
    portalAuth: false,
    business: false,
    member: false,
    recovery: false,
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [gymForm, setGymForm] = useState({ code: "", name: "" });
  const [shiftDrafts, setShiftDrafts] = useState<Record<string, string>>({});
  const [brandingDrafts, setBrandingDrafts] = useState<Record<string, string>>({});
  const [expandedGymId, setExpandedGymId] = useState<string | null>(null);
  const settingsImportRef = useRef<HTMLInputElement | null>(null);
  const [punchKioskBusy, setPunchKioskBusy] = useState(false);
  const [portalAuthMethod, setPortalAuthMethod] = useState<"whatsapp_staff" | "auto_identity">(
    "whatsapp_staff",
  );
  const [portalAuthBusy, setPortalAuthBusy] = useState(false);

  const canFine = hasAccess(user, "settings", "manageFineRule");
  const canAppearance = hasAccess(user, "settings", "viewAppearance");
  const canBranches = isOwner || hasAccess(user, "settings", "manageGymBranches");
  const canSystemFeatures = isOwner || hasAccess(user, "settings", "manageSystemFeatures");
  const canSettingsBackup = isOwner || hasAccess(user, "settings", "manageSettingsBackup");
  const canPortalAuth = isOwner || canSystemFeatures;
  const followSystemTheme = themeReady && theme === "system";
  const activeAppearance = themeReady && resolvedTheme === "dark" ? "Night" : "Day";

  useEffect(() => {
    if (!canPortalAuth) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiFetch<{
          ok?: boolean;
          settings?: { auth_method?: string };
        }>("/portal-settings");
        if (cancelled) return;
        setPortalAuthMethod(
          data.settings?.auth_method === "auto_identity"
            ? "auto_identity"
            : "whatsapp_staff",
        );
      } catch {
        /* keep default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canPortalAuth]);

  async function savePortalAuthMethod(next: "whatsapp_staff" | "auto_identity") {
    setPortalAuthBusy(true);
    try {
      const data = await apiFetch<{
        ok?: boolean;
        settings?: { auth_method?: string };
      }>("/portal-settings", {
        method: "PUT",
        body: JSON.stringify({ auth_method: next }),
      });
      const saved =
        data.settings?.auth_method === "auto_identity"
          ? "auto_identity"
          : "whatsapp_staff";
      setPortalAuthMethod(saved);
      toast.success(
        saved === "auto_identity"
          ? "Member portal: Auto identity auth enabled"
          : "Member portal: WhatsApp verification enabled",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save auth method");
    } finally {
      setPortalAuthBusy(false);
    }
  }

  const visibleBusinessLookups = BUSINESS_LOOKUPS.filter((cat) =>
    hasAccess(user, "settings", cat.permission),
  );
  const visibleMemberLookups = MEMBER_LOOKUPS.filter((cat) =>
    hasAccess(user, "settings", cat.permission),
  );

  const flags = useMemo<FeatureFlagState>(
    () => ({
      attendanceNotesEnabled: settings?.attendanceNotesEnabled === true,
      qrVisitorIntakeEnabled:
        settings?.qrVisitorIntakeEnabled === true ||
        settings?.qrVisitorAttendanceEnabled === true,
      attendanceRequirePresenceQr: settings?.attendanceRequirePresenceQr === true,
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
    mutationFn: (patch: Partial<FeatureFlagState>) => settingsApi.bulk(patch),
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
    onSuccess: async (_data, patch) => {
      // Keep optimistic patch even if a stale in-flight GET races the invalidate.
      qc.setQueriesData<AppSettings>({ queryKey: ["settings"] }, (old) =>
        old ? { ...old, ...patch } : old,
      );
      toast.success("Settings saved");
      await qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  const setFeatureFlags = (override: Partial<FeatureFlagState>) => {
    // Re-send sibling opt-in flags that are already on so sparse saves never wipe them.
    const patch: Partial<FeatureFlagState> = { ...override };
    if (flags.customTemplatesEnabled && patch.customTemplatesEnabled === undefined) {
      patch.customTemplatesEnabled = true;
    }
    if (flags.attendanceNotesEnabled && patch.attendanceNotesEnabled === undefined) {
      patch.attendanceNotesEnabled = true;
    }
    if (flags.qrVisitorIntakeEnabled && patch.qrVisitorIntakeEnabled === undefined) {
      patch.qrVisitorIntakeEnabled = true;
    }
    if (flags.attendanceRequirePresenceQr && patch.attendanceRequirePresenceQr === undefined) {
      patch.attendanceRequirePresenceQr = true;
    }
    if (flags.paymentQrInReminderEnabled && patch.paymentQrInReminderEnabled === undefined) {
      patch.paymentQrInReminderEnabled = true;
    }
    saveFlags.mutate(patch);
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
          description="Appearance, gym branches, Fine SMS rules, system features, and lookups."
        />
        <AppearanceCard
          followSystemTheme={followSystemTheme}
          activeAppearance={activeAppearance}
          themeReady={themeReady}
          resolvedTheme={resolvedTheme}
          open={Boolean(openCat.appearance)}
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
        description="Appearance, gym branches, Fine SMS rules, system features, and lookups."
      />

      {canAppearance ? (
        <AppearanceCard
          followSystemTheme={followSystemTheme}
          activeAppearance={activeAppearance}
          themeReady={themeReady}
          resolvedTheme={resolvedTheme}
          open={Boolean(openCat.appearance)}
          onToggleOpen={() => toggleCat("appearance")}
          onFollowSystem={(on) => {
            if (on) setTheme("system");
            else setTheme(resolvedTheme === "dark" ? "dark" : "light");
          }}
          onSetTheme={setTheme}
        />
      ) : null}

      {canBranches ? (
        <SettingsSectionShell
          title="Gym Branches"
          description="Codes, shift times, display names, and logos"
          open={Boolean(openCat.branches)}
          onToggle={() => toggleCat("branches")}
          accent={SECTION_ACCENTS.branches}
          icon={<Building2 className="h-4 w-4" />}
        >
          <div className="space-y-4 rounded-2xl border border-sky-200/60 bg-gradient-to-b from-sky-50/50 to-white p-4 shadow-sm dark:border-sky-900/40 dark:from-sky-950/20 dark:to-card">
            <div>
              <h3 className="text-sm font-semibold tracking-tight text-sky-950 dark:text-sky-50">
                Branch directory
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                One line per branch — expand to edit display name and logo.
              </p>
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
                className="h-10 rounded-xl bg-sky-700 text-white hover:bg-sky-800 dark:bg-teal-600 dark:hover:bg-teal-500"
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
                        "overflow-hidden rounded-2xl border border-sky-100/90 bg-white/95 shadow-sm transition dark:border-sky-900/30 dark:bg-white/[0.03]",
                        isExpanded && "ring-1 ring-sky-300/70 dark:ring-teal-500/30",
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

                      <div className="flex items-center gap-1.5 border-t border-sky-50 px-3.5 py-2 sm:hidden dark:border-sky-900/20">
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
                        <div className="space-y-3 border-t border-sky-100/80 bg-sky-50/50 px-3.5 py-3.5 dark:border-sky-900/30 dark:bg-sky-950/20">
                          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-sky-800/70 dark:text-sky-200/70">
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
                                className="h-9 rounded-xl bg-sky-700 text-white hover:bg-sky-800 dark:bg-teal-600 dark:hover:bg-teal-500"
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
                  <p className="rounded-2xl border border-dashed border-sky-200 px-4 py-8 text-center text-sm text-muted-foreground dark:border-sky-900/50">
                    No gym codes yet.
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </SettingsSectionShell>
      ) : null}

      {canFine ? (
        <SettingsSectionShell
          title="Fine SMS Rule"
          description="Grace days, Fine SMS eligibility, and payment QR reminders"
          open={Boolean(openCat.fine)}
          onToggle={() => toggleCat("fine")}
          accent={SECTION_ACCENTS.fine}
          icon={<MessageSquareWarning className="h-4 w-4" />}
        >
          <div className="space-y-3 rounded-2xl border border-rose-200/70 bg-gradient-to-b from-rose-50/60 to-white p-4 dark:border-rose-900/50 dark:from-rose-950/25 dark:to-card">
            <SettingsToggle
              checked={flags.fineSmsEnabled}
              label="Enable Fine SMS rules"
              description="Apply Fine SMS eligibility based on grace days and roles."
              onChange={(next) => setFeatureFlags({ fineSmsEnabled: next })}
            />
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-rose-100 bg-white/90 px-3.5 py-3 dark:border-rose-900/40 dark:bg-white/[0.03]">
              <Label className="text-xs font-medium text-rose-900/80 dark:text-rose-100/80">
                Grace days
              </Label>
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
        </SettingsSectionShell>
      ) : null}

      {canSystemFeatures ? (
        <SettingsSectionShell
          title="System Features"
          description="Attendance notes, QR flows, custom templates, and finance estimates"
          open={Boolean(openCat.features)}
          onToggle={() => toggleCat("features")}
          accent={SECTION_ACCENTS.features}
          icon={<Sparkles className="h-4 w-4" />}
        >
          <div className="space-y-3 rounded-2xl border border-violet-200/70 bg-gradient-to-b from-violet-50/50 to-white p-4 dark:border-violet-900/40 dark:from-violet-950/25 dark:to-card">
            <p className="text-xs text-muted-foreground">
              Turn on as many as you need — each save keeps all other flags.
            </p>
            <SettingsToggle
              checked={flags.attendanceNotesEnabled}
              label="Attendance late notes"
              description="Allow staff to submit late-arrival notes on Attendance."
              onChange={(next) => setFeatureFlags({ attendanceNotesEnabled: next })}
            />
            <SettingsToggle
              checked={flags.qrVisitorIntakeEnabled}
              label="QR Visitor intake"
              description="Show the Visitor QR card and allow walk-ins to submit details from the public form."
              onChange={(next) => setFeatureFlags({ qrVisitorIntakeEnabled: next })}
            />
            {flags.qrVisitorIntakeEnabled ? (
              <div className="rounded-xl border border-teal-200/70 bg-teal-50/40 p-3 text-xs text-muted-foreground dark:border-teal-900/40 dark:bg-teal-950/20">
                <p>
                  Download / print the QR on{" "}
                  <a href="/members?tab=visitors" className="font-medium text-foreground underline">
                    Members → Visitors
                  </a>
                  . Guests open{" "}
                  <span className="font-mono text-[11px] text-foreground">
                    /public/visit/&#123;gymCode&#125;
                  </span>{" "}
                  (no login).
                </p>
              </div>
            ) : null}
            <SettingsToggle
              checked={flags.attendanceRequirePresenceQr}
              label="Require attendance QR for Time In"
              description="Staff must scan the gym Attendance QR before login marks Time In."
              onChange={(next) => setFeatureFlags({ attendanceRequirePresenceQr: next })}
            />

            <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/40 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <p className="text-xs font-semibold text-foreground">Always-on punch QR kiosk</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Wall tablet URL with a device token — keeps rotating punch QR after logout. No staff login session required.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={punchKioskBusy || !isOwner}
                  className="inline-flex h-9 items-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent disabled:opacity-50"
                  onClick={async () => {
                    try {
                      setPunchKioskBusy(true);
                      const branchId = String(user?.activeBranchId || user?.gymCodeId || gymCodes[0]?.id || "").trim();
                      const gymCode = String(
                        (gymCodes as GymCode[]).find((g) => g.id === branchId)?.code || gymCodes[0]?.code || branchId,
                      ).trim();
                      if (!branchId) throw new Error("Select a branch first.");
                      const created = await attendanceKioskApi.createDevice({
                        gymCodeId: branchId,
                        gymCode,
                        label: "Reception Kiosk",
                      });
                      const path = String(created.kioskUrl || "").trim();
                      const token = String(created.token || "").trim();
                      const fallback =
                        `/public/attendance-kiosk/${encodeURIComponent(gymCode)}?device=${encodeURIComponent(token)}`;
                      const relative = path.startsWith("http") ? "" : (path || fallback);
                      const url = path.startsWith("http")
                        ? path
                        : `${window.location.origin}${relative.startsWith("/") ? relative : `/${relative}`}`;
                      try {
                        await navigator.clipboard.writeText(url);
                      } catch { /* ignore */ }
                      window.open(url, "_blank", "noopener,noreferrer");
                      toast.success("Kiosk opened — URL copied to clipboard");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Could not open punch QR kiosk");
                    } finally {
                      setPunchKioskBusy(false);
                    }
                  }}
                >
                  {punchKioskBusy ? "Opening…" : "Open always-on punch QR kiosk"}
                </button>
              </div>
            </div>

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
        </SettingsSectionShell>
      ) : null}

      {canPortalAuth ? (
        <SettingsSectionShell
          title="Member Portal Auth"
          description="Choose how members verify before setting a PIN"
          open={Boolean(openCat.portalAuth)}
          onToggle={() => toggleCat("portalAuth")}
          accent={SECTION_ACCENTS.features}
          icon={<KeyRound className="h-4 w-4" />}
        >
          <div className="space-y-3 rounded-2xl border border-sky-200/70 bg-gradient-to-b from-sky-50/50 to-white p-4 dark:border-sky-900/40 dark:from-sky-950/25 dark:to-card">
            <p className="text-xs text-muted-foreground">
              Toggle anytime. Existing member PINs and sessions stay intact — only the first-time
              / re-verify path changes.
            </p>
            <SettingsToggle
              checked={portalAuthMethod === "whatsapp_staff"}
              disabled={portalAuthBusy}
              label="WhatsApp verification (current)"
              description="Member sends WhatsApp OTP to gym; staff approves in WhatsApp Verification, then member sets PIN."
              onChange={(next) => {
                if (next) void savePortalAuthMethod("whatsapp_staff");
              }}
            />
            <SettingsToggle
              checked={portalAuthMethod === "auto_identity"}
              disabled={portalAuthBusy}
              label="Auto identity (mobile + name + DOB or Gmail)"
              description="Member enters mobile, name, and either DOB or Gmail. Values are compared to gym records (lowercase / no spaces for match only). On match, member sets a 6-digit PIN."
              onChange={(next) => {
                if (next) void savePortalAuthMethod("auto_identity");
              }}
            />
          </div>
        </SettingsSectionShell>
      ) : null}

      {visibleBusinessLookups.length ? (
      <SettingsSectionShell
        title="Business Configuration"
        description="Plans, statuses, payment methods, expense categories"
        open={Boolean(openCat.business)}
        onToggle={() => toggleCat("business")}
        accent={SECTION_ACCENTS.business}
        icon={<ClipboardList className="h-4 w-4" />}
      >
        <div className="grid gap-3 lg:grid-cols-2">{visibleBusinessLookups.map(renderLookupCard)}</div>
      </SettingsSectionShell>
      ) : null}

      {visibleMemberLookups.length ? (
      <SettingsSectionShell
        title="Member & PT"
        description="Hold durations, genders, exercise types"
        open={Boolean(openCat.member)}
        onToggle={() => toggleCat("member")}
        accent={SECTION_ACCENTS.member}
        icon={<Users className="h-4 w-4" />}
      >
        <div className="grid gap-3 lg:grid-cols-2">{visibleMemberLookups.map(renderLookupCard)}</div>
      </SettingsSectionShell>
      ) : null}

      {canSettingsBackup ? (
        <SettingsSectionShell
          title="Settings backup & recovery"
          description="Export/import Settings JSON here; full database disaster recovery stays on Backend"
          open={Boolean(openCat.recovery)}
          onToggle={() => toggleCat("recovery")}
          accent={SECTION_ACCENTS.recovery}
          icon={<HardDrive className="h-4 w-4" />}
        >
          <div className="space-y-3 rounded-2xl border border-indigo-200/70 bg-gradient-to-b from-indigo-50/50 to-white p-4 dark:border-indigo-900/40 dark:from-indigo-950/25 dark:to-card">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Settings JSON covers feature flags and lookup lists only. Member data, finance, SQLite
              backups, restore, and Fresh Start remain on the{" "}
              <span className="font-medium text-foreground">Backend</span> page (owner).
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  if (!settings) {
                    toast.error("Settings not loaded yet.");
                    return;
                  }
                  const stamp = new Date().toISOString().slice(0, 10);
                  downloadTextFile(
                    `apg-settings-${stamp}.json`,
                    JSON.stringify(settings, null, 2),
                    "application/json",
                  );
                  toast.success("Settings JSON exported");
                }}
              >
                <Download className="h-3.5 w-3.5" /> Export Settings JSON
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  if (settingsImportRef.current) {
                    settingsImportRef.current.value = "";
                    settingsImportRef.current.click();
                  }
                }}
              >
                <Upload className="h-3.5 w-3.5" /> Import Settings JSON
              </Button>
              <input
                ref={settingsImportRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void file
                    .text()
                    .then(async (text) => {
                      const parsed = JSON.parse(text) as Partial<AppSettings>;
                      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                        throw new Error("Invalid settings JSON");
                      }
                      await settingsApi.bulk(parsed);
                      toast.success("Settings imported");
                      await qc.invalidateQueries({ queryKey: ["settings"] });
                    })
                    .catch((err: Error) => {
                      toast.error(err?.message || "Failed to import settings JSON");
                    });
                }}
              />
            </div>
          </div>
        </SettingsSectionShell>
      ) : null}
    </div>
  );
}
