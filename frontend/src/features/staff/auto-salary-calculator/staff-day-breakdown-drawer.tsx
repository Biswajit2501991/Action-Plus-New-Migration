"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { salaryCalculatorApi } from "@/services/api";
import type { DaySalaryBreakdown, StaffMonthlySalaryReport } from "@/types";

type Props = {
  open: boolean;
  onClose: () => void;
  report: StaffMonthlySalaryReport | null;
  onUpdated?: () => void;
};

export function StaffDayBreakdownDrawer({ open, onClose, report, onUpdated }: Props) {
  const qc = useQueryClient();
  const [customModalDate, setCustomModalDate] = useState<string | null>(null);
  const [customAmount, setCustomAmount] = useState<number>(0);
  const [customReason, setCustomReason] = useState("");

  const waiveMutation = useMutation({
    mutationFn: async ({ date, reason }: { date: string; reason?: string }) => {
      if (!report) return;
      return salaryCalculatorApi.saveOverride({
        staffLoginId: report.staffId,
        date,
        status: "waived",
        reason: reason || "Waived by Owner",
      });
    },
    onSuccess: (_, { date }) => {
      toast.success(`Deduction waived for ${date}`);
      void qc.invalidateQueries({ queryKey: ["salary-calculator"] });
      onUpdated?.();
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to waive deduction.");
    },
  });

  const customDeductMutation = useMutation({
    mutationFn: async () => {
      if (!report || !customModalDate) return;
      return salaryCalculatorApi.saveOverride({
        staffLoginId: report.staffId,
        date: customModalDate,
        status: "custom_deduction",
        customDeductionAmount: Number(customAmount),
        reason: customReason || "Custom Owner Adjustment",
      });
    },
    onSuccess: () => {
      toast.success(`Custom adjustment saved for ${customModalDate}`);
      setCustomModalDate(null);
      void qc.invalidateQueries({ queryKey: ["salary-calculator"] });
      onUpdated?.();
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to save adjustment.");
    },
  });

  const deleteOverrideMutation = useMutation({
    mutationFn: async (date: string) => {
      if (!report) return;
      return salaryCalculatorApi.deleteOverride(report.staffId, date);
    },
    onSuccess: (_, date) => {
      toast.success(`Reset manual override for ${date}`);
      void qc.invalidateQueries({ queryKey: ["salary-calculator"] });
      onUpdated?.();
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to reset override.");
    },
  });

  if (!open || !report) return null;

  const isSplit = report.shiftMode === "split" || Boolean(report.shift2Start);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6">
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {report.staffName}
              </h3>
              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                {report.shiftMode === "single_evening"
                  ? "Evening Shift (Full Day)"
                  : report.shiftMode === "single_morning"
                    ? "Morning Shift (Full Day)"
                    : "Split Shift"}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Month:{" "}
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {new Date(report.year, report.month - 1).toLocaleString("default", {
                  month: "long",
                  year: "numeric",
                })}
              </span>{" "}
              • Base Salary: ₹{report.monthlySalary.toLocaleString()} (Daily: ₹
              {report.dailyWage.toFixed(2)}, Minute: ₹{report.perMinuteRate.toFixed(2)}/m)
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Top Summary Stat Cards */}
        <div className="grid grid-cols-2 gap-3 border-b border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/30 sm:grid-cols-5">
          <div className="rounded-xl border border-slate-200/80 bg-white p-3 dark:border-slate-800 dark:bg-slate-800">
            <span className="text-[11px] font-medium text-slate-500">Present / Total Days</span>
            <p className="text-base font-bold text-slate-900 dark:text-white">
              {report.totalPresentDays}{" "}
              <span className="text-xs font-normal text-slate-400">/ {report.totalDaysInMonth}</span>
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-3 dark:border-slate-800 dark:bg-slate-800">
            <span className="text-[11px] font-medium text-slate-500">Weekly Offs / Holidays</span>
            <p className="text-base font-bold text-slate-900 dark:text-white">
              {report.totalWeeklyOffs + report.totalHolidays}{" "}
              <span className="text-xs font-normal text-slate-400">days</span>
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-3 dark:border-slate-800 dark:bg-slate-800">
            <span className="text-[11px] font-medium text-slate-500">Late Days (Total)</span>
            <p className="text-base font-bold text-amber-600 dark:text-amber-400">
              {report.totalLateDays}{" "}
              <span className="text-xs font-normal text-slate-400">
                ({report.totalDeductedLateMinutes}m deducted)
              </span>
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white p-3 dark:border-slate-800 dark:bg-slate-800">
            <span className="text-[11px] font-medium text-slate-500">Total Deductions</span>
            <p className="text-base font-bold text-rose-600 dark:text-rose-400">
              -₹{report.totalDeductions.toLocaleString()}
            </p>
          </div>

          <div className="col-span-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/40 sm:col-span-1">
            <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
              Net Payable Salary
            </span>
            <p className="text-base font-extrabold text-emerald-700 dark:text-emerald-400">
              ₹{report.netPayableSalary.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Day-by-Day Table */}
        <div className="flex-1 overflow-y-auto p-4">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 dark:border-slate-700">
                <th className="pb-2.5 font-semibold">Date & Day</th>
                <th className="pb-2.5 font-semibold">
                  {report.shiftMode === "single_evening" ? "Evening Punch" : "Morning Punch (Shift 1)"}
                </th>
                {isSplit && <th className="pb-2.5 font-semibold">Evening Punch (Shift 2)</th>}
                <th className="pb-2.5 font-semibold">Notes & Exemption Status</th>
                <th className="pb-2.5 text-right font-semibold">Deduction (₹)</th>
                <th className="pb-2.5 text-right font-semibold">Owner Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {report.dayBreakdown.map((d) => {
                const isLate = d.totalLateMinutes > 0;
                const isOverridden = Boolean(d.overrideStatus);

                return (
                  <tr
                    key={d.date}
                    className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                      d.isWeeklyOff
                        ? "bg-slate-50/40 dark:bg-slate-900/40"
                        : d.isHoliday
                          ? "bg-indigo-50/30 dark:bg-indigo-950/20"
                          : d.status === "Absent"
                            ? "bg-rose-50/20 dark:bg-rose-950/10"
                            : ""
                    }`}
                  >
                    {/* Date */}
                    <td className="py-3 font-medium">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-900 dark:text-white">{d.date.slice(8)}</span>
                        <span className="text-slate-400">({d.dayOfWeek.slice(0, 3)})</span>
                        {d.isWeeklyOff && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            Off
                          </span>
                        )}
                        {d.isHoliday && (
                          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                            {d.holidayTitle || "Holiday"}
                          </span>
                        )}
                        {d.isApprovedLeave && (
                          <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[10px] text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                            Leave
                          </span>
                        )}
                        {d.status === "Absent" && (
                          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                            Absent
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Shift 1 Punch */}
                    <td className="py-3">
                      {d.isWeeklyOff || d.isHoliday || d.isApprovedLeave ? (
                        <span className="text-slate-400">—</span>
                      ) : d.shift1PunchTime ? (
                        <div>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {d.shift1PunchTime}
                          </span>
                          {d.shift1DeductedMinutes > 0 ? (
                            <span className="ml-1.5 inline-block rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              +{d.shift1LateMinutes}m late ({d.shift1DeductedMinutes}m slab)
                            </span>
                          ) : (
                            <span className="ml-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                              ✓ On Time
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400">No punch</span>
                      )}
                    </td>

                    {/* Shift 2 Punch (if split) */}
                    {isSplit && (
                      <td className="py-3">
                        {d.isWeeklyOff || d.isHoliday || d.isApprovedLeave ? (
                          <span className="text-slate-400">—</span>
                        ) : d.shift2PunchTime ? (
                          <div>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {d.shift2PunchTime}
                            </span>
                            {d.shift2DeductedMinutes > 0 ? (
                              <span className="ml-1.5 inline-block rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                +{d.shift2LateMinutes}m late ({d.shift2DeductedMinutes}m slab)
                              </span>
                            ) : (
                              <span className="ml-1.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                                ✓ On Time
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    )}

                    {/* Note & Exemption Status */}
                    <td className="py-3">
                      {d.hasNote ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                              <FileText className="h-3 w-3" />
                              {d.noteCategory || "Note"}
                            </span>
                            {d.noteExemptionStatus?.startsWith("exempt_") &&
                            !d.noteExemptionStatus.includes("limit_exceeded") ? (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                ✓ Free Note ({d.noteExemptionStatus.replace("exempt_", "").replace("_of_", "/")})
                              </span>
                            ) : d.noteExemptionStatus === "exempt_limit_exceeded" ? (
                              <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-800 dark:bg-orange-950 dark:text-orange-300">
                                ⚠ 3rd+ Note (Review Needed)
                              </span>
                            ) : null}
                          </div>
                          {d.noteText && (
                            <p className="line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
                              &ldquo;{d.noteText}&rdquo;
                            </p>
                          )}
                        </div>
                      ) : isLate ? (
                        <span className="text-[11px] text-slate-400">No note submitted</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* Day Deduction Amount */}
                    <td className="py-3 text-right">
                      {d.dayDeductionAmount > 0 ? (
                        <span className="font-bold text-rose-600 dark:text-rose-400">
                          -₹{d.dayDeductionAmount.toFixed(2)}
                        </span>
                      ) : d.overrideStatus === "waived" ? (
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                          Waived (₹0)
                        </span>
                      ) : (
                        <span className="text-slate-400">₹0</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 text-right">
                      {isOverridden ? (
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                            {d.overrideStatus === "waived" ? "Owner Waived" : "Custom Adjusted"}
                          </span>
                          <button
                            onClick={() => deleteOverrideMutation.mutate(d.date)}
                            title="Reset to automated deduction"
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : d.dayDeductionAmount > 0 ? (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              waiveMutation.mutate({
                                date: d.date,
                                reason: d.noteText || "Owner Waived Deduction",
                              })
                            }
                            className="h-7 border-emerald-200 bg-emerald-50/60 px-2 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                          >
                            Waive
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setCustomModalDate(d.date);
                              setCustomAmount(d.dayDeductionAmount);
                              setCustomReason(d.noteText || "");
                            }}
                            className="h-7 px-2 text-[11px] text-slate-500 hover:text-slate-800"
                          >
                            Adjust
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Custom Amount Dialog */}
        {customModalDate && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
              <h4 className="font-bold text-slate-900 dark:text-white">
                Adjust Deduction for {customModalDate}
              </h4>
              <p className="mt-1 text-xs text-slate-500">
                Override automated deduction with a custom amount.
              </p>
              <div className="mt-4 space-y-3">
                <div>
                  <Label className="text-xs">Deduction Amount (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={customAmount}
                    onChange={(e) => setCustomAmount(Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Reason / Note</Label>
                  <Input
                    type="text"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="e.g. Partial waiver approved"
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setCustomModalDate(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={() => customDeductMutation.mutate()}
                  className="bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  Save Adjustment
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 p-4 dark:border-slate-800">
          <span className="text-xs text-slate-500">
            Automated 15-minute slab calculation with 2-day note exemption logic.
          </span>
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
