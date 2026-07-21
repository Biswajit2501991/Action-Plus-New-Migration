"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { buildPtProfilePatch } from "@/lib/domain/pt-drafts";
import { ptApi } from "@/services/api";
import type { AppSettings } from "@/types";
import type { PtClientProfile, PtSaveMode } from "@/types/pt";

const BACKEND_DEBOUNCE_MS = 2500;

/** Must match useSettings() keys like ["settings", "default"] — never write only ["settings"]. */
const SETTINGS_QUERY_PREFIX = ["settings"] as const;

function mergePtProfileResponse(
  local: PtClientProfile,
  saved: PtClientProfile,
): PtClientProfile {
  const localTs = Date.parse(local.updatedAt || "") || 0;
  const savedTs = Date.parse(saved.updatedAt || "") || 0;
  const winner = savedTs >= localTs ? { ...local, ...saved } : { ...saved, ...local };
  const focusByDate =
    savedTs >= localTs ? { ...(saved.focusByDate || {}) } : { ...(local.focusByDate || {}) };
  return {
    ...winner,
    focusByDate,
    updatedAt: savedTs >= localTs ? saved.updatedAt || local.updatedAt : local.updatedAt || saved.updatedAt,
  };
}

function ptSaveErrorMessage(err: unknown) {
  const e = err as { message?: string; status?: number };
  const msg = String(e?.message || "");
  if (msg.includes("edit PT plans") || msg.includes("edit PT workouts")) {
    return msg.replace(/^backend-403:?/i, "").trim() || "You do not have permission to edit PT clients.";
  }
  if (e?.status === 403) {
    return "Save blocked (403). Ask owner to refresh your PT permissions, then log out and back in.";
  }
  if (e?.status === 404) {
    return "PT client member not found on server.";
  }
  return "Could not save PT client changes. Try again or contact owner.";
}

function readCachedPtProfile(qc: QueryClient, memberId: string): PtClientProfile {
  const entries = qc.getQueriesData<AppSettings>({ queryKey: SETTINGS_QUERY_PREFIX });
  for (const [, data] of entries) {
    const map = data?.ptClientProfiles;
    if (map && typeof map === "object" && memberId in (map as object)) {
      return ((map as Record<string, PtClientProfile>)[memberId] || {}) as PtClientProfile;
    }
  }
  for (const [, data] of entries) {
    if (data) return {} as PtClientProfile;
  }
  return {} as PtClientProfile;
}

/** Update every settings-* cache entry (default/pt/leave/…) without wiping other keys. */
function writeCachedPtProfile(
  qc: QueryClient,
  memberId: string,
  nextProfile: PtClientProfile,
) {
  qc.setQueriesData<AppSettings>({ queryKey: SETTINGS_QUERY_PREFIX }, (prev) => {
    if (!prev) return prev;
    const base =
      prev.ptClientProfiles && typeof prev.ptClientProfiles === "object"
        ? (prev.ptClientProfiles as Record<string, PtClientProfile>)
        : {};
    return {
      ...prev,
      ptClientProfiles: { ...base, [memberId]: nextProfile },
    };
  });
}

export function usePtProfile(actorName = "") {
  const qc = useQueryClient();
  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [sectionSaving, setSectionSaving] = useState<Record<string, boolean>>({});

  const updateLocalProfile = useCallback(
    (memberId: string, nextProfile: PtClientProfile) => {
      writeCachedPtProfile(qc, memberId, nextProfile);
    },
    [qc],
  );

  const scheduleBackendSave = useCallback(
    (
      memberId: string,
      profile: PtClientProfile,
      mode: PtSaveMode,
      opts: { immediate?: boolean; waitForBackend?: boolean; silentErrors?: boolean } = {},
    ) => {
      const runSave = async () => {
        const resp = await ptApi.patchProfile(memberId, profile, mode);
        const saved = (resp?.profile || null) as PtClientProfile | null;
        if (!saved) throw new Error("empty_profile_response");
        const local = readCachedPtProfile(qc, memberId);
        writeCachedPtProfile(qc, memberId, mergePtProfileResponse(local, saved));
        return saved;
      };

      if (saveTimersRef.current[memberId]) clearTimeout(saveTimersRef.current[memberId]);

      const delay = opts.immediate ? 0 : BACKEND_DEBOUNCE_MS;

      if (opts.waitForBackend) {
        if (delay <= 0) return runSave();
        return new Promise<PtClientProfile | void>((resolve, reject) => {
          saveTimersRef.current[memberId] = setTimeout(() => {
            runSave().then(resolve).catch(reject);
          }, delay);
        });
      }

      const fire = () => {
        runSave().catch((err) => {
          if (!opts.silentErrors) toast.error(ptSaveErrorMessage(err));
        });
      };

      if (delay <= 0) fire();
      else saveTimersRef.current[memberId] = setTimeout(fire, delay);
      return Promise.resolve();
    },
    [qc],
  );

  const persistProfile = useCallback(
    (memberId: string, patch: Partial<PtClientProfile>, mode: PtSaveMode = "workout") => {
      if (!memberId) return;
      const prevProfile = readCachedPtProfile(qc, memberId);
      const nextProfile = buildPtProfilePatch(prevProfile, patch, actorName);
      writeCachedPtProfile(qc, memberId, nextProfile);
      scheduleBackendSave(memberId, nextProfile, mode);
    },
    [actorName, qc, scheduleBackendSave],
  );

  const saveProfilePatch = useCallback(
    async (
      memberId: string,
      patch: Partial<PtClientProfile>,
      mode: PtSaveMode,
      sectionKey: string,
      successMessage: string,
    ) => {
      if (!memberId || !sectionKey || sectionSaving[sectionKey]) return false;
      setSectionSaving((prev) => ({ ...prev, [sectionKey]: true }));
      try {
        const prevProfile = readCachedPtProfile(qc, memberId);
        const nextProfile = buildPtProfilePatch(prevProfile, patch, actorName);
        writeCachedPtProfile(qc, memberId, nextProfile);
        await scheduleBackendSave(memberId, nextProfile, mode, {
          immediate: true,
          waitForBackend: true,
          silentErrors: true,
        });
        toast.success(successMessage);
        return true;
      } catch (err) {
        toast.error(ptSaveErrorMessage(err));
        return false;
      } finally {
        setSectionSaving((prev) => ({ ...prev, [sectionKey]: false }));
      }
    },
    [actorName, qc, scheduleBackendSave, sectionSaving],
  );

  return {
    persistProfile,
    saveProfilePatch,
    updateLocalProfile,
    scheduleBackendSave,
    sectionSaving,
  };
}
