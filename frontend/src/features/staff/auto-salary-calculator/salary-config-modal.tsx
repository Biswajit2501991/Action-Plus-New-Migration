"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DollarSign, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { salaryCalculatorApi } from "@/services/api";
import type { StaffSalaryProfile, StaffShiftMode, StaffUser } from "@/types";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Props = {
  open: boolean;
  onClose: () => void;
  staffUser: StaffUser | null;
  existingProfile?: StaffSalaryProfile | null;
  onSaved?: () => void;
};

export function SalaryConfigModal({
  open,
  onClose,
  staffUser,
  existingProfile,
  onSaved,
}: Props) {
  const qc = useQueryClient();

  const [monthlySalary, setMonthlySalary] = useState<number>(0);
  const [shiftMode, setShiftMode] = useState<StaffShiftMode>("split");
  const [shift1Start, setShift1Start] = useState("06:30");
  const [shift1End, setShift1End] = useState("11:00");
  const [shift2Start, setShift2Start] = useState("17:00");
  const [shift2End, setShift2End] = useState("20:00");
  const [graceMinutes, setGraceMinutes] = useState(15);
  const [lateStepMinutes, setLateStepMinutes] = useState(15);
  const [monthlyNoteExemptions, setMonthlyNoteExemptions] = useState(2);
  const [weeklyOffDays, setWeeklyOffDays] = useState<string[]>(["Sunday"]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open || !staffUser) return;
    if (existingProfile) {
      setMonthlySalary(existingProfile.monthlySalary ?? 0);
      setShiftMode(existingProfile.shiftMode || "split");
      setShift1Start(existingProfile.shift1Start || "06:30");
      setShift1End(existingProfile.shift1End || "11:00");
      setShift2Start(existingProfile.shift2Start || "17:00");
      setShift2End(existingProfile.shift2End || "20:00");
      setGraceMinutes(existingProfile.graceMinutes ?? 15);
      setLateStepMinutes(existingProfile.lateStepMinutes ?? 15);
      setMonthlyNoteExemptions(existingProfile.monthlyNoteExemptions ?? 2);
      setWeeklyOffDays(
        Array.isArray(existingProfile.weeklyOffDays) && existingProfile.weeklyOffDays.length
          ? existingProfile.weeklyOffDays
          : ["Sunday"],
      );
      setNotes(existingProfile.notes || "");
    } else {
      setMonthlySalary(0);
      setShiftMode("split");
      setShift1Start("06:30");
      setShift1End("11:00");
      setShift2Start("17:00");
      setShift2End("20:00");
      setGraceMinutes(15);
      setLateStepMinutes(15);
      setMonthlyNoteExemptions(2);
      setWeeklyOffDays(["Sunday"]);
      setNotes("");
    }
  }, [open, staffUser, existingProfile]);

  const handleShiftModeChange = (mode: StaffShiftMode) => {
    setShiftMode(mode);
    if (mode === "single_evening") {
      setShift1Start("16:30");
      setShift1End("21:30");
      setShift2Start("");
      setShift2End("");
    } else if (mode === "single_morning") {
      setShift1Start("06:00");
      setShift1End("14:00");
      setShift2Start("");
      setShift2End("");
    } else if (mode === "split") {
      setShift1Start("06:30");
      setShift1End("11:00");
      setShift2Start("17:00");
      setShift2End("20:00");
    }
  };

  const toggleWeeklyOff = (day: string) => {
    setWeeklyOffDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!staffUser) return;
      const payload: Partial<StaffSalaryProfile> = {
        monthlySalary: Number(monthlySalary) || 0,
        shiftMode,
        shift1Start,
        shift1End,
        shift2Start: shiftMode === "split" || shiftMode === "custom" ? shift2Start : null,
        shift2End: shiftMode === "split" || shiftMode === "custom" ? shift2End : null,
        graceMinutes: Number(graceMinutes) || 15,
        lateStepMinutes: Number(lateStepMinutes) || 15,
        monthlyNoteExemptions: Number(monthlyNoteExemptions) || 0,
        weeklyOffDays: weeklyOffDays.length ? weeklyOffDays : ["Sunday"],
        notes: notes.trim() || undefined,
      };
      return salaryCalculatorApi.saveProfile(staffUser.id, payload);
    },
    onSuccess: () => {
      toast.success(`Saved salary & shift settings for ${staffUser?.name || staffUser?.id}`);
      void qc.invalidateQueries({ queryKey: ["salary-calculator"] });
      onSaved?.();
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to save salary configuration.";
      toast.error(msg);
    },
  });

  if (!open || !staffUser) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
              <DollarSign className="h-5 w-5 text-emerald-500" />
              Salary & Shift Settings
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Configure compensation, shift timings, and deduction rules for{" "}
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {staffUser.name || staffUser.id}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
          className="mt-4 space-y-5"
        >
          {/* Monthly Salary */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
            <Label className="font-semibold text-slate-800 dark:text-slate-200">
              Monthly Fixed Salary (₹)
            </Label>
            <div className="relative mt-1.5">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-slate-500">
                ₹
              </span>
              <Input
                type="number"
                min={0}
                step={500}
                value={monthlySalary}
                onChange={(e) => setMonthlySalary(Number(e.target.value))}
                placeholder="25000"
                className="pl-8 font-medium"
                required
              />
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Used to compute daily wage and exact per-minute wage rates.
            </p>
          </div>

          {/* Shift Schedule Mode */}
          <div>
            <Label className="font-semibold text-slate-800 dark:text-slate-200">
              Shift Schedule Type
            </Label>
            <Select
              value={shiftMode}
              onChange={(e) => handleShiftModeChange(e.target.value as StaffShiftMode)}
              className="mt-1.5"
            >
              <option value="split">Split Shift (Morning + Evening)</option>
              <option value="single_evening">Single Shift — Evening Full Day (e.g. 4:30 PM – 9:30 PM)</option>
              <option value="single_morning">Single Shift — Morning Full Day (e.g. 6:00 AM – 2:00 PM)</option>
              <option value="custom">Custom Shift Timings</option>
            </Select>
          </div>

          {/* Shift 1 Timings */}
          <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
            <div>
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {shiftMode === "single_evening"
                  ? "Evening Shift Start (24h)"
                  : "Shift 1 Start (Morning / Full Day)"}
              </Label>
              <Input
                type="time"
                value={shift1Start}
                onChange={(e) => setShift1Start(e.target.value)}
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {shiftMode === "single_evening"
                  ? "Evening Shift End"
                  : "Shift 1 End"}
              </Label>
              <Input
                type="time"
                value={shift1End}
                onChange={(e) => setShift1End(e.target.value)}
                className="mt-1"
                required
              />
            </div>
          </div>

          {/* Shift 2 Timings (for split shift) */}
          {(shiftMode === "split" || shiftMode === "custom") && (
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4 dark:border-indigo-950/40 dark:bg-indigo-950/20">
              <div>
                <Label className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">
                  Shift 2 Start (Evening)
                </Label>
                <Input
                  type="time"
                  value={shift2Start || "17:00"}
                  onChange={(e) => setShift2Start(e.target.value)}
                  className="mt-1"
                  required
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">
                  Shift 2 End (Night)
                </Label>
                <Input
                  type="time"
                  value={shift2End || "20:00"}
                  onChange={(e) => setShift2End(e.target.value)}
                  className="mt-1"
                  required
                />
              </div>
            </div>
          )}

          {/* Grace Period & Step Deduction */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Grace Period (Mins)
              </Label>
              <Input
                type="number"
                min={0}
                max={60}
                value={graceMinutes}
                onChange={(e) => setGraceMinutes(Number(e.target.value))}
                className="mt-1"
              />
              <span className="text-[11px] text-slate-500">e.g. 15m grace window</span>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Late Slab Step (Mins)
              </Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={lateStepMinutes}
                onChange={(e) => setLateStepMinutes(Number(e.target.value))}
                className="mt-1"
              />
              <span className="text-[11px] text-slate-500">e.g. 15m per slab</span>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Free Note Days / Mo
              </Label>
              <Input
                type="number"
                min={0}
                max={10}
                value={monthlyNoteExemptions}
                onChange={(e) => setMonthlyNoteExemptions(Number(e.target.value))}
                className="mt-1 font-semibold text-emerald-600 dark:text-emerald-400"
              />
              <span className="text-[11px] text-slate-500">2 days free late w/ note</span>
            </div>
          </div>

          {/* Weekly Off Days */}
          <div>
            <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Weekly Off Days
            </Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => {
                const active = weeklyOffDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleWeeklyOff(day)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "border border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saveMutation.isPending}
              className="bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
            >
              {saveMutation.isPending ? "Saving..." : "Save Configuration"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
