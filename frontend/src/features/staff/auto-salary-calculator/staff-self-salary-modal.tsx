"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Calculator,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Info,
  X,
} from "lucide-react";
import { Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { salaryCalculatorApi } from "@/services/api";
import { StaffDayBreakdownDrawer } from "./staff-day-breakdown-drawer";
import type { StaffMonthlySalaryReport } from "@/types";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function StaffSelfSalaryModal({ open, onClose }: Props) {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [breakdownOpen, setBreakdownOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["salary-calculator", "my-report", selectedYear, selectedMonth],
    queryFn: () =>
      salaryCalculatorApi.getMyReport({
        year: selectedYear,
        month: selectedMonth,
      }),
    enabled: open,
  });

  if (!open) return null;

  const report: StaffMonthlySalaryReport | undefined = data?.report;
  const monthName = new Date(selectedYear, selectedMonth - 1).toLocaleString("default", {
    month: "long",
  });

  const prevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <div className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
                <Calculator className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Auto Salary Calculator
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Monthly attendance-based salary computation & deduction summary (Read-Only)
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Month Selector Bar */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
              <button
                onClick={prevMonth}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                title="Previous Month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[130px] text-center text-xs font-bold text-slate-800 dark:text-slate-100">
                {monthName} {selectedYear}
              </span>
              <button
                onClick={nextMonth}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                title="Next Month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <Info className="h-3.5 w-3.5 text-indigo-500" />
              <span>15m late slabs apply after grace & free note exemptions.</span>
            </div>
          </div>

          {/* 4 Summary Cards */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. Monthly Fixed Salary */}
            <Card className="border-slate-200 dark:border-slate-800">
              <CardContent className="p-4">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Monthly Fixed Salary (₹)
                </span>
                <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">
                  ₹{(report?.monthlySalary || 0).toLocaleString()}
                </p>
                <span className="text-[11px] text-slate-400">
                  Daily: ₹{(report?.dailyWage || 0).toFixed(1)} / day
                </span>
              </CardContent>
            </Card>

            {/* 2. Late Deductions (15m Slabs) */}
            <Card className="border-amber-200/80 bg-amber-50/20 dark:border-amber-950/40 dark:bg-amber-950/10">
              <CardContent className="p-4">
                <span className="text-xs font-medium text-amber-800 dark:text-amber-300">
                  Late Deductions (15m Slabs)
                </span>
                <p className="mt-1 text-2xl font-black text-amber-700 dark:text-amber-400">
                  -₹{(report?.totalLatenessDeductionAmount || 0).toLocaleString()}
                </p>
                <span className="text-[11px] text-amber-700/80 dark:text-amber-400/80">
                  {report?.totalLateDays || 0} late instances ({report?.totalDeductedLateMinutes || 0}m deducted)
                </span>
              </CardContent>
            </Card>

            {/* 3. Absence Deductions */}
            <Card className="border-rose-200/80 bg-rose-50/20 dark:border-rose-950/40 dark:bg-rose-950/10">
              <CardContent className="p-4">
                <span className="text-xs font-medium text-rose-800 dark:text-rose-300">
                  Absence Deductions
                </span>
                <p className="mt-1 text-2xl font-black text-rose-700 dark:text-rose-400">
                  -₹{(report?.totalAbsenceDeductionAmount || 0).toLocaleString()}
                </p>
                <span className="text-[11px] text-rose-700/80 dark:text-rose-400/80">
                  {report?.totalAbsentDays || 0} unexcused missed days
                </span>
              </CardContent>
            </Card>

            {/* 4. Net Payable Payroll */}
            <Card className="border-emerald-200 bg-emerald-50/40 dark:border-emerald-950/60 dark:bg-emerald-950/20">
              <CardContent className="p-4">
                <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  Net Payable Payroll
                </span>
                <p className="mt-1 text-2xl font-black text-emerald-700 dark:text-emerald-400">
                  ₹{(report?.netPayableSalary || 0).toLocaleString()}
                </p>
                <span className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
                  Final for {monthName}
                </span>
              </CardContent>
            </Card>
          </div>

          {/* Details Table */}
          <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            {isLoading ? (
              <div className="space-y-3 p-6">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : !report ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No salary calculation found for {monthName} {selectedYear}.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-300">
                      <th className="px-4 py-3">Staff Member</th>
                      <th className="px-4 py-3">Shift Timings</th>
                      <th className="px-4 py-3">Base Salary</th>
                      <th className="px-4 py-3">Attendance Overview</th>
                      <th className="px-4 py-3">Lateness Monitored</th>
                      <th className="px-4 py-3 text-right">Deductions</th>
                      <th className="px-4 py-3 text-right">Net Payable</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    <tr className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      {/* Staff Member */}
                      <td className="px-4 py-3.5">
                        <div>
                          <span className="font-bold text-slate-900 dark:text-white">
                            {report.staffName}
                          </span>
                          <p className="text-[11px] text-slate-500">ID: {report.staffId}</p>
                        </div>
                      </td>

                      {/* Shift Timings */}
                      <td className="px-4 py-3.5">
                        <div>
                          <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {report.shiftMode === "single_evening"
                              ? `Evening: ${report.shift1Start} - ${report.shift1End}`
                              : report.shiftMode === "single_morning"
                                ? `Morning: ${report.shift1Start} - ${report.shift1End}`
                                : `Split: ${report.shift1Start}-${report.shift1End} & ${report.shift2Start || "17:00"}-${report.shift2End || "20:00"}`}
                          </span>
                          <p className="mt-0.5 text-[10px] text-slate-400">
                            Grace: {report.graceMinutes}m • {report.monthlyNoteExemptions} Free Notes/mo
                          </p>
                        </div>
                      </td>

                      {/* Base Salary */}
                      <td className="px-4 py-3.5 font-semibold text-slate-800 dark:text-slate-200">
                        ₹{report.monthlySalary.toLocaleString()}
                        <p className="text-[10px] font-normal text-slate-400">
                          Daily: ₹{report.dailyWage.toFixed(1)}
                        </p>
                      </td>

                      {/* Attendance Overview */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            {report.totalPresentDays} Present
                          </span>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {report.totalWeeklyOffs} Off
                          </span>
                          {report.totalHolidays > 0 && (
                            <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                              {report.totalHolidays} Hol
                            </span>
                          )}
                          {report.totalApprovedLeaves > 0 && (
                            <span className="rounded bg-teal-50 px-1.5 py-0.5 font-medium text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                              {report.totalApprovedLeaves} Leave
                            </span>
                          )}
                          {report.totalAbsentDays > 0 && (
                            <span className="rounded bg-rose-50 px-1.5 py-0.5 font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                              {report.totalAbsentDays} Absent
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Lateness Monitored */}
                      <td className="px-4 py-3.5">
                        {report.totalLateDays > 0 ? (
                          <div>
                            <span className="font-semibold text-amber-700 dark:text-amber-400">
                              {report.totalLateDays} Late Days
                            </span>
                            <p className="text-[10px] text-slate-500">
                              {report.totalDeductedLateMinutes}m deducted • {report.noteExemptionsUsed} notes used
                            </p>
                          </div>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            ✓ 0 Late Days
                          </span>
                        )}
                      </td>

                      {/* Deductions */}
                      <td className="px-4 py-3.5 text-right">
                        {report.totalDeductions > 0 ? (
                          <div>
                            <span className="font-bold text-rose-600 dark:text-rose-400">
                              -₹{report.totalDeductions.toLocaleString()}
                            </span>
                            <p className="text-[10px] text-slate-400">
                              Late: ₹{report.totalLatenessDeductionAmount.toFixed(0)} | Abs: ₹
                              {report.totalAbsenceDeductionAmount.toFixed(0)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-400">₹0</span>
                        )}
                      </td>

                      {/* Net Payable */}
                      <td className="px-4 py-3.5 text-right">
                        <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                          ₹{report.netPayableSalary.toLocaleString()}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setBreakdownOpen(true)}
                          className="h-7 border-indigo-200 bg-indigo-50/50 px-2.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300"
                        >
                          <Calendar className="mr-1 h-3.5 w-3.5" />
                          Day Breakdown
                        </Button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-6 flex items-center justify-end border-t border-slate-100 pt-4 dark:border-slate-800">
            <Button variant="outline" onClick={onClose} className="px-5 text-xs font-semibold">
              Close
            </Button>
          </div>
        </div>
      </div>

      {/* Day Breakdown Drawer */}
      {breakdownOpen && report && (
        <StaffDayBreakdownDrawer
          open={breakdownOpen}
          onClose={() => setBreakdownOpen(false)}
          report={report}
          readOnly={true}
          onUpdated={() => {
            void refetch();
          }}
        />
      )}
    </>
  );
}
