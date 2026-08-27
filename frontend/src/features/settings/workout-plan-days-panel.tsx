"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { apiFetch } from "@/services/api/client";
import { WORKOUT_PLAN_EXERCISES } from "@/lib/workout-plan-exercises";
import {
  WORKOUT_PLAN_DAYS,
  slugExerciseKey,
  type WorkoutPlanLevel,
} from "@/lib/workout-plan-days";
import { cn } from "@/lib/utils";

type AddedExercise = {
  id: string;
  dayId: string;
  exerciseKey: string;
  name: string;
  muscle: string;
  setsReps: string;
  rest: string;
};

type DayPayload = {
  dayId: string;
  label: string;
  restDay?: boolean;
  baseExerciseKeys: string[];
  added: AddedExercise[];
};

type LabelItem = { exerciseKey: string; displayName: string };

const LEVELS: Array<{ id: WorkoutPlanLevel; label: string }> = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
];

export function WorkoutPlanDaysPanel() {
  const [level, setLevel] = useState<WorkoutPlanLevel>("beginner");
  const [days, setDays] = useState<DayPayload[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [dayId, setDayId] = useState("");
  const [catalogKey, setCatalogKey] = useState("");
  const [customName, setCustomName] = useState("");
  const [muscle, setMuscle] = useState("");
  const [setsReps, setSetsReps] = useState("3×10–12");
  const [rest, setRest] = useState("60–90s");
  const [renameKey, setRenameKey] = useState("");
  const [renameName, setRenameName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({
    name: "",
    muscle: "",
    setsReps: "",
    rest: "",
  });

  const reloadLabels = useCallback(async () => {
    const data = await apiFetch<{ ok?: boolean; items?: LabelItem[] }>(
      "/portal-workout-exercise-labels",
    );
    const map: Record<string, string> = {};
    for (const item of data.items || []) {
      if (item.exerciseKey && item.displayName) map[item.exerciseKey] = item.displayName;
    }
    setLabels(map);
  }, []);

  const reload = useCallback(async () => {
    const data = await apiFetch<{ ok?: boolean; days?: DayPayload[] }>(
      `/portal-workout-day-exercises?level=${encodeURIComponent(level)}`,
    );
    const next = Array.isArray(data.days) ? data.days : [];
    setDays(next);
    const firstWork = next.find((d) => !d.restDay);
    setDayId((prev) =>
      next.some((d) => d.dayId === prev && !d.restDay)
        ? prev
        : firstWork?.dayId || "",
    );
  }, [level]);

  useEffect(() => {
    setBusy(true);
    void Promise.all([reload(), reloadLabels()])
      .catch((err: Error) => toast.error(err.message || "Could not load Workout Plan editor"))
      .finally(() => setBusy(false));
  }, [reload, reloadLabels]);

  const workDays = useMemo(() => days.filter((d) => !d.restDay), [days]);
  const selectedDay = workDays.find((d) => d.dayId === dayId) || null;

  const catalogOptions = useMemo(() => {
    const blocked = new Set([
      ...(selectedDay?.baseExerciseKeys || []),
      ...(selectedDay?.added || []).map((a) => a.exerciseKey),
    ]);
    return WORKOUT_PLAN_EXERCISES.filter((ex) => !blocked.has(ex.exerciseKey));
  }, [selectedDay]);

  const displayName = (key: string, fallback: string) => labels[key] || fallback;

  async function addExercise() {
    if (!dayId) {
      toast.error("Choose a day");
      return;
    }
    const fromCatalog = WORKOUT_PLAN_EXERCISES.find((ex) => ex.exerciseKey === catalogKey);
    const name =
      (fromCatalog ? displayName(fromCatalog.exerciseKey, fromCatalog.name) : "") ||
      customName.trim();
    if (!name) {
      toast.error("Pick a catalog exercise or enter a custom name");
      return;
    }
    const exerciseKey = fromCatalog?.exerciseKey || slugExerciseKey(name);
    setBusy(true);
    try {
      await apiFetch("/portal-workout-day-exercises", {
        method: "POST",
        body: JSON.stringify({
          level,
          dayId,
          exerciseKey,
          name,
          muscle: muscle.trim(),
          setsReps: setsReps.trim() || "3×10–12",
          rest: rest.trim() || "60–90s",
        }),
      });
      toast.success(`Added ${name}`);
      setCatalogKey("");
      setCustomName("");
      setMuscle("");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add exercise");
    } finally {
      setBusy(false);
    }
  }

  async function removeExercise(item: AddedExercise) {
    if (!window.confirm(`Remove “${item.name}” from this day? Members will no longer see it.`)) {
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/portal-workout-day-exercises/${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });
      toast.success("Removed from Member Portal day");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove");
    } finally {
      setBusy(false);
    }
  }

  async function saveRename() {
    const key = renameKey.trim();
    const name = renameName.trim();
    if (!key || !name) {
      toast.error("Pick an exercise and enter the new name");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/portal-workout-exercise-labels", {
        method: "POST",
        body: JSON.stringify({ exerciseKey: key, displayName: name }),
      });
      toast.success("Name updated everywhere this exercise appears");
      await Promise.all([reloadLabels(), reload()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not rename");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(item: AddedExercise) {
    setBusy(true);
    try {
      await apiFetch(`/portal-workout-day-exercises/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editDraft.name.trim(),
          muscle: editDraft.muscle.trim(),
          setsReps: editDraft.setsReps.trim() || "3×10–12",
          rest: editDraft.rest.trim() || "60–90s",
        }),
      });
      toast.success("Exercise updated");
      setEditId(null);
      await Promise.all([reload(), reloadLabels()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-white/10">
        <div>
          <p className="text-sm font-medium text-foreground">Rename exercise (syncs everywhere)</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Changes the display name for the same exercise key across Beginner / Intermediate /
            Advanced. Progress ticks stay linked to the key.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Exercise</Label>
            <Select
              className="mt-1"
              value={renameKey}
              disabled={busy}
              onChange={(e) => {
                const key = e.target.value;
                setRenameKey(key);
                const catalog = WORKOUT_PLAN_EXERCISES.find((ex) => ex.exerciseKey === key);
                setRenameName(displayName(key, catalog?.name || ""));
              }}
            >
              <option value="">Select exercise…</option>
              {WORKOUT_PLAN_EXERCISES.map((ex) => (
                <option key={ex.exerciseKey} value={ex.exerciseKey}>
                  {displayName(ex.exerciseKey, ex.name)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>New display name</Label>
            <Input
              className="mt-1"
              value={renameName}
              disabled={busy || !renameKey}
              onChange={(e) => setRenameName(e.target.value)}
              placeholder="e.g. Dead Bug (modified)"
            />
          </div>
        </div>
        <Button type="button" disabled={busy || !renameKey || !renameName.trim()} onClick={() => void saveRename()}>
          Save name
        </Button>
      </div>

      <div>
        <p className="text-sm font-medium text-foreground">Add exercises to program days</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Appends to built-in days and shows automatically in the Member Portal schedule for that
          level. Upload demo videos below using the same exercise key.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {LEVELS.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={busy}
            onClick={() => setLevel(item.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium",
              level === item.id
                ? "border-teal-500/50 bg-teal-500/15 text-teal-700 dark:text-teal-200"
                : "border-slate-200 text-slate-600 dark:border-white/10 dark:text-slate-300",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 p-3 dark:border-white/10 md:grid-cols-2">
        <div>
          <Label>Day</Label>
          <Select
            className="mt-1"
            value={dayId}
            onChange={(e) => setDayId(e.target.value)}
            disabled={busy}
          >
            <option value="">Select day</option>
            {workDays.map((d) => (
              <option key={d.dayId} value={d.dayId}>
                Day {WORKOUT_PLAN_DAYS[level].find((x) => x.dayId === d.dayId)?.dayNumber || "?"}{" "}
                · {d.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>From exercise catalog (optional)</Label>
          <Select
            className="mt-1"
            value={catalogKey}
            onChange={(e) => {
              setCatalogKey(e.target.value);
              if (e.target.value) setCustomName("");
            }}
            disabled={busy}
          >
            <option value="">Custom name below…</option>
            {catalogOptions.map((ex) => (
              <option key={ex.exerciseKey} value={ex.exerciseKey}>
                {displayName(ex.exerciseKey, ex.name)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Custom exercise name</Label>
          <Input
            className="mt-1"
            value={customName}
            disabled={busy || Boolean(catalogKey)}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="e.g. Farmer Carry"
          />
        </div>
        <div>
          <Label>Muscle / focus</Label>
          <Input
            className="mt-1"
            value={muscle}
            disabled={busy}
            onChange={(e) => setMuscle(e.target.value)}
            placeholder="e.g. Core, grip"
          />
        </div>
        <div>
          <Label>Sets × reps</Label>
          <Input
            className="mt-1"
            value={setsReps}
            disabled={busy}
            onChange={(e) => setSetsReps(e.target.value)}
          />
        </div>
        <div>
          <Label>Rest</Label>
          <Input
            className="mt-1"
            value={rest}
            disabled={busy}
            onChange={(e) => setRest(e.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <Button type="button" disabled={busy || !dayId} onClick={() => void addExercise()}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add to day
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {workDays.map((day) => (
          <div
            key={day.dayId}
            className="rounded-xl border border-slate-200 p-3 dark:border-white/10"
          >
            <p className="text-sm font-semibold text-foreground">
              Day {WORKOUT_PLAN_DAYS[level].find((x) => x.dayId === day.dayId)?.dayNumber} ·{" "}
              {day.label}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Base keys:{" "}
              {day.baseExerciseKeys
                .map((key) => {
                  const catalog = WORKOUT_PLAN_EXERCISES.find((ex) => ex.exerciseKey === key);
                  return displayName(key, catalog?.name || key);
                })
                .join(", ")}
            </p>
            {!day.added?.length ? (
              <p className="mt-2 text-xs text-muted-foreground">No staff-added exercises yet.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {day.added.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-white/[0.04]"
                  >
                    {editId === item.id ? (
                      <div className="space-y-2">
                        <Input
                          value={editDraft.name}
                          onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                          placeholder="Name"
                        />
                        <Input
                          value={editDraft.muscle}
                          onChange={(e) => setEditDraft((d) => ({ ...d, muscle: e.target.value }))}
                          placeholder="Muscle"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            value={editDraft.setsReps}
                            onChange={(e) =>
                              setEditDraft((d) => ({ ...d, setsReps: e.target.value }))
                            }
                            placeholder="Sets × reps"
                          />
                          <Input
                            value={editDraft.rest}
                            onChange={(e) => setEditDraft((d) => ({ ...d, rest: e.target.value }))}
                            placeholder="Rest"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy}
                            onClick={() => void saveEdit(item)}
                          >
                            Save
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => setEditId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-foreground">
                            {displayName(item.exerciseKey, item.name)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {item.muscle || "—"} · {item.setsReps} · rest {item.rest}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{item.exerciseKey}</p>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              setEditId(item.id);
                              setEditDraft({
                                name: displayName(item.exerciseKey, item.name),
                                muscle: item.muscle || "",
                                setsReps: item.setsReps || "",
                                rest: item.rest || "",
                              });
                            }}
                            aria-label={`Edit ${item.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void removeExercise(item)}
                            aria-label={`Remove ${item.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
