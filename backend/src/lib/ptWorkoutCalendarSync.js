/**
 * Keep PT Scheduler (plan_json.focusByDate) and Member Expand Workout
 * (member_daily_workouts) in sync. Notes are never wiped.
 * Failures are non-fatal for callers — wrap with try/catch at call sites if needed.
 */

function normalizeDate(input) {
  const s = String(input || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function normalizeFocusLabel(input) {
  return String(input || "").trim().slice(0, 80);
}

function focusLabelFromExercises(exercises) {
  const list = Array.isArray(exercises)
    ? exercises.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
  if (!list.length) return null;
  if (list.length === 1) return list[0].slice(0, 80);
  return list.join(", ").slice(0, 80);
}

function isSingleScheduledFocus(exercises, previousFocus) {
  if (!Array.isArray(exercises) || exercises.length !== 1) return false;
  const only = String(exercises[0] || "").trim();
  if (!only) return false;
  if (!previousFocus) return true;
  return only.toLowerCase() === String(previousFocus).trim().toLowerCase();
}

/**
 * Apply one day's focus change into member_daily_workouts.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 */
export async function syncFocusDayToDailyWorkout(
  sb,
  { gymId, memberUuid, dateKey, focus, previousFocus, actor },
) {
  const gid = String(gymId || "").trim();
  const uuid = String(memberUuid || "").trim();
  const day = normalizeDate(dateKey);
  if (!gid || !uuid || !day) return { ok: false, reason: "bad-args" };

  const nextFocus = focus ? normalizeFocusLabel(focus) : null;
  const prevFocus = previousFocus ? normalizeFocusLabel(previousFocus) : null;
  const nowIso = new Date().toISOString();
  const recordedBy = String(actor || "trainer").trim().slice(0, 120) || "trainer";

  const { data: existing, error: loadErr } = await sb
    .from("member_daily_workouts")
    .select("id, exercises, notes, source")
    .eq("gym_id", gid)
    .eq("member_uuid", uuid)
    .eq("workout_date", day)
    .maybeSingle();
  if (loadErr) throw loadErr;

  const exercises = Array.isArray(existing?.exercises) ? existing.exercises : [];
  const notes = String(existing?.notes || "").trim();

  if (nextFocus) {
    // Create or replace only when empty / single prior scheduled focus.
    // Multi-exercise staff logs are left intact (calendar already marked).
    const shouldReplace =
      !existing || exercises.length === 0 || isSingleScheduledFocus(exercises, prevFocus);
    if (!shouldReplace) return { ok: true, skipped: "detailed-log" };

    const { error } = await sb.from("member_daily_workouts").upsert(
      {
        gym_id: gid,
        member_uuid: uuid,
        workout_date: day,
        exercises: [nextFocus],
        notes,
        recorded_by: recordedBy,
        source: "gym_manager",
        updated_at: nowIso,
      },
      { onConflict: "gym_id,member_uuid,workout_date" },
    );
    if (error) throw error;
    return { ok: true, action: "upsert-focus" };
  }

  // Cleared focus: remove only empty or single-exercise scheduled days.
  // Multi-exercise staff logs are left intact.
  if (!existing) return { ok: true, skipped: "no-daily-row" };
  const clearable = exercises.length <= 1;
  if (!clearable) return { ok: true, skipped: "detailed-log" };

  if (!notes) {
    const { error } = await sb
      .from("member_daily_workouts")
      .delete()
      .eq("gym_id", gid)
      .eq("member_uuid", uuid)
      .eq("workout_date", day);
    if (error) throw error;
    return { ok: true, action: "delete-day" };
  }

  const { error } = await sb
    .from("member_daily_workouts")
    .update({
      exercises: [],
      notes,
      recorded_by: recordedBy,
      source: existing.source || "gym_manager",
      updated_at: nowIso,
    })
    .eq("gym_id", gid)
    .eq("member_uuid", uuid)
    .eq("workout_date", day);
  if (error) throw error;
  return { ok: true, action: "clear-exercises-keep-notes" };
}

/** Diff prev/next focusByDate maps and sync each changed day. */
export async function syncFocusMapDiffToDaily(
  sb,
  { gymId, memberUuid, prevFocusByDate, nextFocusByDate, actor },
) {
  const prev =
    prevFocusByDate && typeof prevFocusByDate === "object" ? prevFocusByDate : {};
  const next =
    nextFocusByDate && typeof nextFocusByDate === "object" ? nextFocusByDate : {};
  const dates = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const results = [];
  for (const dateKey of dates) {
    const a = normalizeFocusLabel(prev[dateKey]) || null;
    const b = normalizeFocusLabel(next[dateKey]) || null;
    if (a === b) continue;
    results.push(
      await syncFocusDayToDailyWorkout(sb, {
        gymId,
        memberUuid,
        dateKey,
        focus: b,
        previousFocus: a,
        actor,
      }),
    );
  }
  return results;
}

/**
 * Mirror a daily workout save into PT focusByDate (when a PT profile exists).
 */
export async function syncDailyWorkoutToFocus(
  sb,
  { gymId, memberPk, dateKey, exercises },
) {
  const gid = String(gymId || "").trim();
  const memberId = Number(memberPk);
  const day = normalizeDate(dateKey);
  if (!gid || !Number.isFinite(memberId) || memberId <= 0 || !day) {
    return { ok: false, reason: "bad-args" };
  }

  const { data: profileRows, error: profileErr } = await sb
    .from("pt_client_profiles")
    .select("id, plan_json")
    .eq("gym_id", gid)
    .eq("member_id", memberId)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (profileErr) throw profileErr;
  const profileRow = Array.isArray(profileRows) && profileRows.length ? profileRows[0] : null;
  if (!profileRow?.id) return { ok: true, skipped: "no-pt-profile" };

  const plan =
    profileRow.plan_json && typeof profileRow.plan_json === "object"
      ? { ...profileRow.plan_json }
      : {};
  const focusByDate =
    plan.focusByDate && typeof plan.focusByDate === "object"
      ? { ...plan.focusByDate }
      : {};
  const nextFocus = focusLabelFromExercises(exercises);
  const prevFocus = normalizeFocusLabel(focusByDate[day]) || null;

  if (nextFocus) focusByDate[day] = nextFocus;
  else delete focusByDate[day];

  const after = normalizeFocusLabel(focusByDate[day]) || null;
  if (prevFocus === after) return { ok: true, skipped: "unchanged" };

  const nowIso = new Date().toISOString();
  plan.focusByDate = focusByDate;
  if (nextFocus) plan.focusArea = nextFocus;
  plan.updatedAt = nowIso;

  const { error } = await sb
    .from("pt_client_profiles")
    .update({ plan_json: plan, updated_at: nowIso })
    .eq("id", profileRow.id);
  if (error) throw error;

  try {
    const { notifyCollectionChange } = await import("../realtime/supabaseListener.js");
    notifyCollectionChange("settings");
  } catch {
    /* optional realtime hook */
  }

  return { ok: true, action: nextFocus ? "set-focus" : "clear-focus" };
}

/**
 * Merge trainer focusByDate into a daily byDate map for Expand Workout calendar.
 * Does not overwrite days that already have exercises.
 */
export async function loadFocusByDateForMember(sb, { gymId, memberPk }) {
  const gid = String(gymId || "").trim();
  const memberId = Number(memberPk);
  if (!gid || !Number.isFinite(memberId) || memberId <= 0) return {};

  const { data: profileRows, error } = await sb
    .from("pt_client_profiles")
    .select("plan_json")
    .eq("gym_id", gid)
    .eq("member_id", memberId)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const plan = profileRows?.[0]?.plan_json;
  const focusByDate =
    plan && typeof plan === "object" && plan.focusByDate && typeof plan.focusByDate === "object"
      ? plan.focusByDate
      : {};
  const out = {};
  for (const [k, v] of Object.entries(focusByDate)) {
    const day = normalizeDate(k);
    const label = normalizeFocusLabel(v);
    if (day && label) out[day] = label;
  }
  return out;
}

export function mergeFocusIntoByDate(byDate, focusByDate) {
  const out = { ...(byDate && typeof byDate === "object" ? byDate : {}) };
  const focus = focusByDate && typeof focusByDate === "object" ? focusByDate : {};
  for (const [day, label] of Object.entries(focus)) {
    const existing = out[day];
    const hasExercises =
      Array.isArray(existing?.exercises) && existing.exercises.length > 0;
    if (hasExercises) continue;
    out[day] = {
      ...(existing || {}),
      exercises: [label],
      notes: existing?.notes || "",
      source: existing?.source || "pt_schedule",
      recorded_by: existing?.recorded_by || null,
      updated_at: existing?.updated_at || null,
      fromPtSchedule: true,
    };
  }
  return out;
}
