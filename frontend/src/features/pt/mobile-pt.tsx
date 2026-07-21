"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { MobileHero, MobilePanel } from "@/components/layout/mobile-ui";
import { MemberAvatar } from "@/components/member-avatar";
import { Skeleton } from "@/components/ui/misc";
import { useMembers, useSettings, useUsers } from "@/hooks/use-data";
import { useMemberPhotoHydration } from "@/hooks/use-member-photo-hydration";
import { usePtProfile } from "@/hooks/use-pt-profile";
import { PtWorkoutTab } from "@/features/pt/pt-workout-tab";
import { filterPtMembersForViewer } from "@/lib/domain/pt-trainer-scope";
import { DEFAULT_EXERCISE_TYPES } from "@/lib/domain/pt-defaults";
import { ptWorkoutNotesDraftFromProfile } from "@/lib/domain/pt-drafts";
import { normalizeAccess } from "@/lib/domain/permissions";
import { formatDate, cn } from "@/lib/utils";
import { useAuthStore } from "@/stores";
import type { PtClientProfile } from "@/types/pt";
import type { Member } from "@/types";

const EMPTY_PT_PROFILE: PtClientProfile = {};

/** Mobile PT roster + full Workout Scheduler for staff with edit access. */
export function MobilePt() {
  const user = useAuthStore((s) => s.user);
  const actorName = user?.name || user?.id || "";
  const { data: members = [], isLoading: membersLoading } = useMembers();
  const { data: users = [] } = useUsers();
  const { data: settings, isLoading: settingsLoading } = useSettings();
  useMemberPhotoHydration(members);
  const { persistProfile, saveProfilePatch, sectionSaving } = usePtProfile(actorName);

  const access = normalizeAccess(user?.access);
  const canView = access.ptClients?.viewPtClients !== false;
  const canEditPtWorkout = access.ptClients?.editPtWorkout !== false;

  const profilesMap = (settings?.ptClientProfiles || {}) as Record<string, PtClientProfile>;
  const ptMembers = useMemo(
    () => filterPtMembersForViewer(members, profilesMap, user, users),
    [members, profilesMap, user, users],
  );
  const [selected, setSelected] = useState<Member | null>(null);
  const [workoutNotesDraft, setWorkoutNotesDraft] = useState("");
  const [workoutDateReviewPending, setWorkoutDateReviewPending] = useState(false);

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

  const profile: PtClientProfile =
    (selected && profilesMap[selected.memberId]) || EMPTY_PT_PROFILE;

  useEffect(() => {
    if (!selected) {
      setWorkoutNotesDraft("");
      return;
    }
    const next = profilesMap[selected.memberId] || EMPTY_PT_PROFILE;
    setWorkoutNotesDraft(ptWorkoutNotesDraftFromProfile(next));
  }, [selected, profilesMap]);

  if (membersLoading || settingsLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-48" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!canView) {
    return (
      <MobilePanel>
        <p className="px-4 py-8 text-center text-sm text-slate-500">No PT access on this account.</p>
      </MobilePanel>
    );
  }

  return (
    <div className="space-y-4">
      <MobileHero
        eyebrow="Training"
        title="PT Clients"
        subtitle={
          canEditPtWorkout
            ? `${ptMembers.length} clients · tap to edit Workout Scheduler`
            : `${ptMembers.length} clients · view snapshot`
        }
      />

      {ptMembers.length === 0 ? (
        <MobilePanel>
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            No PT clients yet. Assign a PT plan from Members.
          </p>
        </MobilePanel>
      ) : (
        <div className="space-y-2.5">
          {ptMembers.map((m) => {
            const p = profilesMap[m.memberId] || {};
            const trainer = String(p.trainerId || m.staff || m.trainerId || "Unassigned");
            return (
              <button
                key={m.memberId}
                type="button"
                onClick={() => {
                  setWorkoutDateReviewPending(Boolean(selected && selected.memberId !== m.memberId));
                  setSelected(m);
                }}
                className="flex w-full items-center gap-3 rounded-[1.25rem] border border-black/5 bg-white/85 px-3.5 py-3 text-left shadow-sm transition active:scale-[0.99] dark:border-white/8 dark:bg-white/[0.04]"
              >
                <MemberAvatar member={m} className="h-12 w-12" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                    {m.name}
                  </p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {m.plan || "PT"} · Coach {trainer}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Billing {formatDate(m.billingDate) || "—"}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            );
          })}
        </div>
      )}

      {selected ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/45 p-0 backdrop-blur-[2px]">
          <button
            type="button"
            className="min-h-[8vh] flex-1"
            aria-label="Close"
            onClick={() => setSelected(null)}
          />
          <div className="max-h-[92vh] overflow-y-auto rounded-t-[1.75rem] border border-black/5 bg-[#f7f5f1] p-4 shadow-2xl dark:border-white/10 dark:bg-[#0c121c] sm:p-5">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
            <div className="mb-4 flex items-center gap-3">
              <MemberAvatar member={selected} className="h-12 w-12" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold tracking-tight">{selected.name}</p>
                <p className="text-xs text-slate-500">
                  {selected.memberId} · Workout Scheduler
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className={cn(
                  "rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300",
                )}
              >
                Close
              </button>
            </div>

            <PtWorkoutTab
              member={selected}
              profile={profile}
              trainers={trainers}
              focusOptions={focusOptions}
              canEdit={canEditPtWorkout}
              sectionSaving={sectionSaving}
              onPersistTrainer={(trainerId) =>
                void persistProfile(selected.memberId, { trainerId }, "workout")
              }
              onSaveNotes={() =>
                void saveProfilePatch(
                  selected.memberId,
                  { ptWorkoutNotes: workoutNotesDraft },
                  "workout",
                  "workoutNotes",
                  "PT Workout Notes saved successfully",
                )
              }
              onSaveFocus={async (focus, workoutDateKey) => {
                if (!canEditPtWorkout) return false;
                const savedFocusByDate = profile.focusByDate || {};
                const nextMap = { ...savedFocusByDate };
                if (!focus) delete nextMap[workoutDateKey];
                else nextMap[workoutDateKey] = focus;
                return Boolean(
                  await saveProfilePatch(
                    selected.memberId,
                    {
                      focusByDate: nextMap,
                      focusArea: nextMap[workoutDateKey] || profile.focusArea || "",
                    },
                    "workout",
                    "focusSchedule",
                    "Workout schedule saved successfully",
                  ),
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
          </div>
        </div>
      ) : null}
    </div>
  );
}
