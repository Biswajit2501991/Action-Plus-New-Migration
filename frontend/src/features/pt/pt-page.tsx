"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader, Skeleton, StatCard } from "@/components/ui/misc";
import { Card, CardContent } from "@/components/ui/card";
import { useMembers, useSettings, useUsers } from "@/hooks/use-data";
import { usePtProfile } from "@/hooks/use-pt-profile";
import { PtClientPicker } from "@/features/pt/pt-client-picker";
import { PtWorkoutTab } from "@/features/pt/pt-workout-tab";
import {
  PtChatTab,
  PtDietPlanTab,
  PtSessionsTab,
  PtWeightTab,
  PtWorkoutPlanTab,
  buildDietAttachmentsFromFiles,
} from "@/features/pt/pt-plan-tabs";
import { DEFAULT_EXERCISE_TYPES, PT_TABS, type PtTab } from "@/lib/domain/pt-defaults";
import { filterPtMembersForViewer } from "@/lib/domain/pt-trainer-scope";
import {
  ptDietDraftFromProfile,
  ptWorkoutNotesDraftFromProfile,
  ptWorkoutPlanDraftFromProfile,
} from "@/lib/domain/pt-drafts";
import { isoDate } from "@/lib/domain/member-dates";
import { normalizeAccess } from "@/lib/domain/permissions";
import { cn, formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores";
import type { PtClientProfile } from "@/types/pt";

const EMPTY_PT_PROFILE: PtClientProfile = {};
const EMPTY_PT_PROFILES: Record<string, PtClientProfile> = {};

export function PtPage() {
  const user = useAuthStore((s) => s.user);
  const actorName = user?.name || user?.id || "";
  const { data: members = [], isLoading: membersLoading } = useMembers();
  const { data: users = [] } = useUsers();
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const { persistProfile, saveProfilePatch, sectionSaving } = usePtProfile(actorName);

  const access = normalizeAccess(user?.access);
  const canViewPtClients = access.ptClients?.viewPtClients !== false;
  const canEditPtPlan = access.ptClients?.editPtPlan !== false;
  const canEditPtWorkout = access.ptClients?.editPtWorkout !== false;
  const canUploadDietDocuments = access.ptClients?.uploadDietDocuments !== false;

  const profilesMap = settings?.ptClientProfiles as Record<string, PtClientProfile> | undefined;
  const profiles = profilesMap || EMPTY_PT_PROFILES;
  const ptMembers = useMemo(
    () => filterPtMembersForViewer(members, profiles, user, users),
    [members, profiles, user, users],
  );

  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [activeSubTab, setActiveSubTab] = useState<PtTab>("PT Workout");
  const [workoutDateReviewPending, setWorkoutDateReviewPending] = useState(false);

  const [workoutNotesDraft, setWorkoutNotesDraft] = useState("");
  const [workoutPlanDraft, setWorkoutPlanDraft] = useState("");
  const [dietDraft, setDietDraft] = useState(() => ptDietDraftFromProfile(null));

  useEffect(() => {
    if (!ptMembers.length) {
      setSelectedMemberId((prev) => (prev ? "" : prev));
      return;
    }
    if (!selectedMemberId || !ptMembers.some((m) => m.memberId === selectedMemberId)) {
      const nextId = ptMembers[0].memberId;
      setSelectedMemberId((prev) => (prev === nextId ? prev : nextId));
    }
  }, [ptMembers, selectedMemberId]);

  const selectedMember = ptMembers.find((m) => m.memberId === selectedMemberId) || null;
  const profile: PtClientProfile =
    (selectedMemberId && profiles[selectedMemberId]) || EMPTY_PT_PROFILE;

  // Sync drafts when the selected client (or their saved profile) changes.
  // Bail out of setState when values are unchanged to avoid update-depth loops
  // if settings/profile object identity churns between renders.
  useEffect(() => {
    const nextProfile =
      (selectedMemberId && profilesMap?.[selectedMemberId]) || EMPTY_PT_PROFILE;
    const notes = ptWorkoutNotesDraftFromProfile(nextProfile);
    const plan = ptWorkoutPlanDraftFromProfile(nextProfile);
    const diet = ptDietDraftFromProfile(nextProfile);
    setWorkoutNotesDraft((prev) => (prev === notes ? prev : notes));
    setWorkoutPlanDraft((prev) => (prev === plan ? prev : plan));
    setDietDraft((prev) =>
      prev.calories === diet.calories &&
      prev.protein === diet.protein &&
      prev.water === diet.water &&
      prev.dietPlan === diet.dietPlan
        ? prev
        : diet,
    );
  }, [selectedMemberId, profilesMap]);

  const focusOptions = useMemo(() => {
    const fromSettings = Array.isArray(settings?.exerciseTypes)
      ? (settings.exerciseTypes as string[])
      : [];
    return fromSettings.length ? fromSettings : [...DEFAULT_EXERCISE_TYPES];
  }, [settings?.exerciseTypes]);

  const trainers = useMemo(
    () =>
      users.filter(
        (u) => !u.blocked && (u.id === "trainer" || (u.sections || []).includes("PT Clients")),
      ),
    [users],
  );

  const sessionsToday = (profile.sessions || []).filter((s) => isoDate(s.date) === isoDate(new Date()));
  const weightLogs = (profile.weightLogs || [])
    .slice()
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  const firstWeight = weightLogs[0]?.weight ?? null;
  const latestWeight = weightLogs[weightLogs.length - 1]?.weight ?? null;
  const weightDelta =
    firstWeight != null && latestWeight != null ? latestWeight - firstWeight : null;

  const selectPtClient = (memberId: string) => {
    const nextId = String(memberId || "").trim();
    if (!nextId) return;
    if (nextId !== String(selectedMemberId || "").trim()) {
      setWorkoutDateReviewPending(true);
    }
    setSelectedMemberId(nextId);
  };

  const memberId = selectedMember?.memberId || "";

  if (membersLoading || settingsLoading) return <Skeleton className="h-96" />;

  if (!canViewPtClients) {
    return (
      <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        PT Clients view access is disabled for this staff profile.
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="PT Clients"
        description="Training operations from member data + PT logs."
        actions={
          <PtClientPicker
            members={ptMembers}
            selectedId={selectedMemberId}
            onSelect={selectPtClient}
          />
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Total PT Clients" value={String(ptMembers.length)} tone="sky" />
        <StatCard label="Today's Sessions" value={String(sessionsToday.length)} tone="teal" />
        <StatCard
          label="Weight Trend"
          value={weightDelta == null ? "NA" : `${weightDelta > 0 ? "+" : ""}${weightDelta.toFixed(1)} kg`}
          tone="emerald"
        />
      </div>

      <Card>
        <CardContent className="space-y-4 p-3 sm:p-4">
          <div className="flex flex-wrap gap-2">
            {PT_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveSubTab(tab)}
                className={cn(
                  "rounded-full border px-3 py-2 text-xs font-medium transition-colors",
                  activeSubTab === tab
                    ? "border-sky-600 bg-sky-600 text-white"
                    : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          {!selectedMember ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              No PT client found. Assign PT plan in Members to enable this section.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 p-3 text-sm">
                <span className="font-semibold">{selectedMember.name}</span>
                <span className="text-muted-foreground">
                  • {selectedMember.plan} • Billing: {formatDate(selectedMember.billingDate)}
                </span>
              </div>

              {activeSubTab === "PT Workout" ? (
                <PtWorkoutTab
                  member={selectedMember}
                  profile={profile}
                  trainers={trainers}
                  focusOptions={focusOptions}
                  canEdit={canEditPtWorkout}
                  sectionSaving={sectionSaving}
                  onPersistTrainer={(trainerId) => persistProfile(memberId, { trainerId }, "workout")}
                  onSaveNotes={() =>
                    void saveProfilePatch(
                      memberId,
                      { ptWorkoutNotes: workoutNotesDraft },
                      "workout",
                      "workoutNotes",
                      "PT Workout Notes saved successfully",
                    )
                  }
                  onSaveFocus={async (focus, workoutDateKey) => {
                    if (!selectedMember || !canEditPtWorkout) return false;
                    const savedFocusByDate = profile.focusByDate || {};
                    const nextMap = { ...savedFocusByDate };
                    if (!focus) delete nextMap[workoutDateKey];
                    else nextMap[workoutDateKey] = focus;
                    return saveProfilePatch(
                      memberId,
                      {
                        focusByDate: nextMap,
                        focusArea: nextMap[workoutDateKey] || profile.focusArea || "",
                      },
                      "workout",
                      "focusSchedule",
                      "Workout schedule saved successfully",
                    );
                  }}
                  workoutNotesDraft={workoutNotesDraft}
                  onWorkoutNotesChange={setWorkoutNotesDraft}
                  workoutNotesDirty={
                    workoutNotesDraft !== ptWorkoutNotesDraftFromProfile(profile)
                  }
                  reviewPending={workoutDateReviewPending}
                  onConfirmReview={() => setWorkoutDateReviewPending(false)}
                />
              ) : null}

              {activeSubTab === "Workout Plan" ? (
                <PtWorkoutPlanTab
                  profile={profile}
                  canEdit={canEditPtPlan}
                  sectionSaving={sectionSaving}
                  workoutPlanDraft={workoutPlanDraft}
                  onWorkoutPlanChange={setWorkoutPlanDraft}
                  onSave={() =>
                    void saveProfilePatch(
                      memberId,
                      { workoutPlan: workoutPlanDraft },
                      "plan",
                      "workoutPlan",
                      "Weekly Workout Plan saved successfully",
                    )
                  }
                />
              ) : null}

              {activeSubTab === "Diet Plan" ? (
                <PtDietPlanTab
                  profile={profile}
                  canEditPlan={canEditPtPlan}
                  canUploadDocs={canUploadDietDocuments}
                  sectionSaving={sectionSaving}
                  dietDraft={dietDraft}
                  onDietDraftChange={setDietDraft}
                  onSaveDiet={() =>
                    void saveProfilePatch(
                      memberId,
                      {
                        calories: dietDraft.calories,
                        protein: dietDraft.protein,
                        water: dietDraft.water,
                        dietPlan: dietDraft.dietPlan,
                      },
                      "plan",
                      "dietPlan",
                      "Diet Plan saved successfully",
                    )
                  }
                  onAddAttachments={async (files) => {
                    if (!canUploadDietDocuments || sectionSaving.dietDocs) return;
                    if (!selectedMember || !files?.length) return;
                    const next = await buildDietAttachmentsFromFiles(files, profile.dietAttachments);
                    await saveProfilePatch(
                      memberId,
                      { dietAttachments: next },
                      "plan",
                      "dietDocs",
                      "Diet document saved successfully",
                    );
                  }}
                  onRemoveAttachment={async (id) => {
                    if (!canUploadDietDocuments || sectionSaving.dietDocs) return;
                    if (!selectedMember || !id) return;
                    const next = (profile.dietAttachments || []).filter((item) => item.id !== id);
                    await saveProfilePatch(
                      memberId,
                      { dietAttachments: next },
                      "plan",
                      "dietDocs",
                      "Diet document removed",
                    );
                  }}
                />
              ) : null}

              {activeSubTab === "Chat Trainer" ? (
                <PtChatTab
                  profile={profile}
                  canEdit={canEditPtWorkout}
                  sectionSaving={sectionSaving}
                  actorName={actorName}
                  onAddMessage={async (text) => {
                    const next = [
                      {
                        id: crypto.randomUUID(),
                        by: actorName || "Staff",
                        text,
                        ts: new Date().toISOString(),
                      },
                      ...(profile.chat || []),
                    ].slice(0, 100);
                    return saveProfilePatch(
                      memberId,
                      { chat: next, lastChatAt: new Date().toISOString() },
                      "workout",
                      "chat",
                      "Trainer note saved successfully",
                    );
                  }}
                />
              ) : null}

              {activeSubTab === "Today Sessions" ? (
                <PtSessionsTab
                  profile={profile}
                  canEdit={canEditPtWorkout}
                  sectionSaving={sectionSaving}
                  onAddSession={async (sessionDraft) => {
                    const next = [
                      {
                        id: crypto.randomUUID(),
                        ...sessionDraft,
                        createdAt: new Date().toISOString(),
                      },
                      ...(profile.sessions || []),
                    ].slice(0, 120);
                    return saveProfilePatch(
                      memberId,
                      { sessions: next },
                      "workout",
                      "session",
                      "Session saved successfully",
                    );
                  }}
                />
              ) : null}

              {activeSubTab === "Weight Progress" ? (
                <PtWeightTab
                  profile={profile}
                  canEdit={canEditPtWorkout}
                  sectionSaving={sectionSaving}
                  onAddWeight={async ({ date, weight }) => {
                    const next = [
                      {
                        id: crypto.randomUUID(),
                        date,
                        weight,
                        createdAt: new Date().toISOString(),
                      },
                      ...(profile.weightLogs || []),
                    ]
                      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
                      .slice(0, 200);
                    return saveProfilePatch(
                      memberId,
                      { weightLogs: next },
                      "workout",
                      "weight",
                      "Weight saved successfully",
                    );
                  }}
                />
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
