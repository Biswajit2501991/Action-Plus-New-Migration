"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { apiFetch } from "@/services/api/client";
import { cn } from "@/lib/utils";
import type { GymCode } from "@/types";
import {
  DEFAULT_PORTAL_SECTIONS,
  mergePortalSections,
  normalizePortalSections,
  type PortalSections,
} from "@/lib/member-portal-ui-config";

type BranchPortalResponse = {
  ok?: boolean;
  gymCodeId?: string;
  portal_enabled?: boolean;
  portal_sections?: PortalSections;
  inheritsGymWideSections?: boolean;
  hasOverride?: boolean;
  error?: string;
};

const HOME_TILE_META: {
  key: keyof PortalSections;
  label: string;
  description: string;
}[] = [
  { key: "homeProfile", label: "Profile", description: "Member profile details tile." },
  { key: "homeQrCard", label: "QR Card", description: "Digital membership QR card." },
  { key: "homeDevices", label: "Devices", description: "Trusted devices management." },
  { key: "homePayments", label: "Payments", description: "Recent payments and receipts." },
  { key: "homeAttendance", label: "Attendance", description: "Check-in history and gym QR check-in." },
  { key: "homeAlerts", label: "Alerts", description: "Billing-day push reminders." },
  { key: "homeChat", label: "Chat", description: "Chat with the gym." },
  { key: "homeTraining", label: "Training", description: "Workouts, PT days, and notes." },
  {
    key: "homeWeightTracker",
    label: "Weight Tracker",
    description: "Weight log for all members (Basic and PT).",
  },
  {
    key: "homeWorkoutPlan",
    label: "Workout Plan",
    description: "Self-guided workout plan tile for this branch.",
  },
  { key: "homeBook", label: "Book", description: "Class / slot bookings." },
  { key: "homePerks", label: "Perks", description: "Member perks and offers." },
  {
    key: "perksRequestLocker",
    label: "Request locker",
    description: "Inside Perks: show the Request locker button.",
  },
  { key: "homeBiometric", label: "Biometric", description: "Face ID / fingerprint login setup." },
];

const TRAINING_SECTION_META: { key: keyof PortalSections; label: string }[] = [
  { key: "basicDailyWorkouts", label: "Basic · Daily workout chips" },
  { key: "basicNotes", label: "Basic · Notes" },
  { key: "measurements", label: "Measurements" },
  { key: "ptSchedule", label: "PT · Schedule days" },
  { key: "ptMemberNotes", label: "PT · Member notes" },
  { key: "ptAssignment", label: "PT · Trainer assignment" },
  { key: "ptDiet", label: "PT · Diet" },
  { key: "ptWorkoutDetails", label: "PT · Workout details" },
];

type Props = {
  gymCodes: GymCode[];
  disabled?: boolean;
};

export function BranchPortalAccessPanel({ gymCodes, disabled }: Props) {
  const [branchId, setBranchId] = useState("");
  const [portalEnabled, setPortalEnabled] = useState(true);
  const [sections, setSections] = useState<PortalSections>(() => ({
    ...DEFAULT_PORTAL_SECTIONS,
  }));
  const [inheritsGymWide, setInheritsGymWide] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const loadBranch = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await apiFetch<BranchPortalResponse>(
        `/portal-branch-settings?gymCodeId=${encodeURIComponent(id)}`,
      );
      setPortalEnabled(data.portal_enabled !== false);
      setSections(
        mergePortalSections(data.portal_sections, DEFAULT_PORTAL_SECTIONS),
      );
      setInheritsGymWide(data.inheritsGymWideSections !== false);
      setDirty(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load branch portal settings",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!branchId && gymCodes.length) {
      const first = String(gymCodes[0]?.id || "").trim();
      if (first) setBranchId(first);
    }
  }, [gymCodes, branchId]);

  useEffect(() => {
    if (branchId) void loadBranch(branchId);
  }, [branchId, loadBranch]);

  const save = async () => {
    if (!branchId || disabled) return;
    setSaving(true);
    try {
      const data = await apiFetch<BranchPortalResponse>("/portal-branch-settings", {
        method: "PUT",
        body: JSON.stringify({
          gymCodeId: branchId,
          portal_enabled: portalEnabled,
          portal_sections: normalizePortalSections(sections),
        }),
      });
      setPortalEnabled(data.portal_enabled !== false);
      setSections(
        mergePortalSections(data.portal_sections, DEFAULT_PORTAL_SECTIONS),
      );
      setInheritsGymWide(data.inheritsGymWideSections === true);
      setDirty(false);
      toast.success("Branch Member Portal settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = (key: keyof PortalSections) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
    setDirty(true);
  };

  if (!gymCodes.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Add a gym branch first, then control Member Portal access per branch here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Hides portal for this branch without changing each member&apos;s portal switch.
        Gym-wide Member Portal settings remain the default for branches you have not
        customized. Turning a branch back on restores access with no member data rewrite.
      </p>

      <label className="block text-xs font-medium text-foreground">
        Branch
        <Select
          className="mt-1"
          value={branchId}
          disabled={disabled || loading || saving}
          onChange={(e) => {
            setBranchId(e.target.value);
            setDirty(false);
          }}
        >
          {gymCodes.map((g) => (
            <option key={g.id} value={g.id}>
              {g.code}
              {g.displayName || g.name ? ` · ${g.displayName || g.name}` : ""}
            </option>
          ))}
        </Select>
      </label>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.06] bg-white/80 px-3.5 py-3 dark:border-white/10 dark:bg-white/[0.03]">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            Allow Member Portal for this branch
          </p>
          <p className="text-[11px] text-muted-foreground">
            Soft gate only — does not change members&apos; individual portal switches.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={portalEnabled}
          disabled={disabled || loading || saving}
          onClick={() => {
            setPortalEnabled((v) => !v);
            setDirty(true);
          }}
          className={cn(
            "relative h-7 w-12 shrink-0 rounded-full transition-colors",
            portalEnabled ? "bg-slate-900 dark:bg-teal-600" : "bg-slate-300 dark:bg-slate-600",
            (disabled || loading || saving) && "opacity-50",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform",
              portalEnabled && "translate-x-5",
            )}
          />
        </button>
      </div>

      {!portalEnabled ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          Members of this branch cannot sign in to Member Portal until you turn this back on.
        </p>
      ) : null}

      <div className="space-y-2">
        <div>
          <p className="text-sm font-medium text-foreground">Home tiles for this branch</p>
          <p className="text-[11px] text-muted-foreground">
            {inheritsGymWide && !dirty
              ? "Currently inheriting gym-wide tile settings until you save branch overrides."
              : "These overrides apply only to members assigned to this branch."}
          </p>
        </div>
        {HOME_TILE_META.map((meta) => (
          <div
            key={meta.key}
            className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.06] bg-white/80 px-3.5 py-2.5 dark:border-white/10 dark:bg-white/[0.03]"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{meta.label}</p>
              <p className="text-[11px] text-muted-foreground">{meta.description}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={sections[meta.key]}
              disabled={disabled || loading || saving || !portalEnabled}
              onClick={() => toggleSection(meta.key)}
              className={cn(
                "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                sections[meta.key]
                  ? "bg-slate-900 dark:bg-teal-600"
                  : "bg-slate-300 dark:bg-slate-600",
                (disabled || loading || saving || !portalEnabled) && "opacity-50",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform",
                  sections[meta.key] && "translate-x-5",
                )}
              />
            </button>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Training sections</p>
        {TRAINING_SECTION_META.map((meta) => (
          <div
            key={meta.key}
            className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.06] bg-white/80 px-3.5 py-2.5 dark:border-white/10 dark:bg-white/[0.03]"
          >
            <p className="text-sm font-medium text-foreground">{meta.label}</p>
            <button
              type="button"
              role="switch"
              aria-checked={sections[meta.key]}
              disabled={disabled || loading || saving || !portalEnabled}
              onClick={() => toggleSection(meta.key)}
              className={cn(
                "relative h-7 w-12 shrink-0 rounded-full transition-colors",
                sections[meta.key]
                  ? "bg-slate-900 dark:bg-teal-600"
                  : "bg-slate-300 dark:bg-slate-600",
                (disabled || loading || saving || !portalEnabled) && "opacity-50",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform",
                  sections[meta.key] && "translate-x-5",
                )}
              />
            </button>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={disabled || loading || saving || !dirty || !branchId}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save branch portal settings"}
        </Button>
      </div>
    </div>
  );
}
