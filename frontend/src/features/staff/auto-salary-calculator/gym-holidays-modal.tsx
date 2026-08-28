"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Calendar, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { salaryCalculatorApi } from "@/services/api";
import type { GymHoliday } from "@/types";

type Props = {
  open: boolean;
  onClose: () => void;
  holidays: GymHoliday[];
  onUpdated?: () => void;
};

export function GymHolidaysModal({ open, onClose, holidays = [], onUpdated }: Props) {
  const qc = useQueryClient();
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");

  const addHolidayMutation = useMutation({
    mutationFn: async () => {
      if (!newDate || !newName.trim()) {
        throw new Error("Please select a date and enter holiday title.");
      }
      return salaryCalculatorApi.saveHoliday({
        date: newDate,
        name: newName.trim(),
        isPaid: true,
      });
    },
    onSuccess: () => {
      toast.success("Gym holiday added.");
      setNewDate("");
      setNewName("");
      void qc.invalidateQueries({ queryKey: ["salary-calculator"] });
      onUpdated?.();
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to add holiday.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => salaryCalculatorApi.deleteHoliday(id),
    onSuccess: () => {
      toast.success("Holiday removed.");
      void qc.invalidateQueries({ queryKey: ["salary-calculator"] });
      onUpdated?.();
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to delete holiday.");
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
              <Calendar className="h-5 w-5 text-indigo-500" />
              Gym Holidays & Shutdowns
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Dates marked here are treated as Paid Holidays (0 salary deduction for staff).
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Add Holiday Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addHolidayMutation.mutate();
          }}
          className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Holiday Date
              </Label>
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Title / Occasion
              </Label>
              <Input
                type="text"
                placeholder="e.g. Diwali, Renovation"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1"
                required
              />
            </div>
          </div>
          <Button
            type="submit"
            disabled={addHolidayMutation.isPending}
            className="w-full bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            {addHolidayMutation.isPending ? "Adding..." : "Add Holiday"}
          </Button>
        </form>

        {/* Existing Holidays List */}
        <div className="mt-5 space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Declared Holidays ({holidays.length})
          </h4>
          {!holidays.length ? (
            <p className="py-4 text-center text-xs text-slate-400">
              No custom holidays added yet. (Sundays are automatically treated as weekly offs).
            </p>
          ) : (
            <div className="max-h-60 space-y-2 overflow-y-auto">
              {holidays.map((h) => (
                <div
                  key={h.id || h.date}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-800"
                >
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {h.name}
                    </span>
                    <p className="text-xs text-slate-500">{h.date}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(h.id || h.date)}
                    className="text-rose-500 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end border-t border-slate-100 pt-3 dark:border-slate-800">
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
