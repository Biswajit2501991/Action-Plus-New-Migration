"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Search,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { salaryCalculatorApi } from "@/services/api";
import { useGymCodes, useUsers } from "@/hooks/use-data";
import { useBranchStore } from "@/stores";
import { SalaryConfigModal } from "./salary-config-modal";
import { GymHolidaysModal } from "./gym-holidays-modal";
import { StaffDayBreakdownDrawer } from "./staff-day-breakdown-drawer";
import type { StaffMonthlySalaryReport, StaffUser } from "@/types";

export function SalaryCalculatorPanel() {
  const activeBranchId = useBranchStore((s) => s.activeBranchId);

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>(activeBranchId || "");

  const { data: gymCodes = [] } = useGymCodes();
  const { data: allUsers = [] } = useUsers();

  const [configModalStaff, setConfigModalStaff] = useState<StaffUser | null>(null);
  const [holidaysModalOpen, setHolidaysModalOpen] = useState(false);
  const [breakdownReport, setBreakdownReport] = useState<StaffMonthlySalaryReport | null>(null);

  // Fetch monthly salary report
  const {
    data: reportData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["salary-calculator", "monthly-report", selectedYear, selectedMonth, selectedBranchFilter],
    queryFn: () =>
      salaryCalculatorApi.getMonthlyReport({
        year: selectedYear,
        month: selectedMonth,
        gymCodeId: selectedBranchFilter || undefined,
      }),
  });

  // Fetch configs (profiles, holidays)
  const { data: configData } = useQuery({
    queryKey: ["salary-calculator", "config"],
    queryFn: () => salaryCalculatorApi.getConfig(),
  });

  const staffReports = useMemo(() => reportData?.staffReports || [], [reportData?.staffReports]);
  const summary = reportData?.summary;
  const holidays = reportData?.holidays || configData?.holidays || [];

  const filteredReports = useMemo(() => {
    let list = staffReports;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.staffName.toLowerCase().includes(q) ||
          r.staffId.toLowerCase().includes(q),
      );
    }
    return list;
  }, [staffReports, searchQuery]);

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

  const openConfigForStaff = (staffId: string) => {
    const u = allUsers.find((x) => x.id.toLowerCase() === staffId.toLowerCase()) || {
      id: staffId,
      name: staffId,
    };
    setConfigModalStaff(u as StaffUser);
  };

  const exportCsv = () => {
    if (!filteredReports.length) return;
    const headers = [
      "Staff ID",
      "Staff Name",
      "Shift Mode",
      "Base Salary",
      "Present Days",
      "Weekly Offs",
      "Holidays",
      "Approved Leaves",
      "Absent Days",
      "Late Days",
      "Late Mins Deducted",
      "Free Notes Used",
      "Lateness Deductions",
      "Absence Deductions",
      "Net Payable Salary",
    ];

    const rows = filteredReports.map((r) => [
      `"${r.staffId}"`,
      `"${r.staffName}"`,
      `"${r.shiftMode}"`,
      r.monthlySalary,
      r.totalPresentDays,
      r.totalWeeklyOffs,
      r.totalHolidays,
      r.totalApprovedLeaves,
      r.totalAbsentDays,
      r.totalLateDays,
      r.totalDeductedLateMinutes,
      `${r.noteExemptionsUsed}/${r.monthlyNoteExemptions}`,
      r.totalLatenessDeductionAmount,
      r.totalAbsenceDeductionAmount,
      r.netPayableSalary,
    ]);

    const csvContent = [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Gym_Salary_Payroll_${selectedYear}_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Filter Bar */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {/* Month Navigation */}
          <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-800">
            <button
              onClick={prevMonth}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-slate-800 dark:hover:bg-slate-700"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[140px] text-center text-sm font-bold text-slate-800 dark:text-slate-100">
              {monthName} {selectedYear}
            </span>
            <button
              onClick={nextMonth}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-slate-800 dark:hover:bg-slate-700"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Branch Filter if multi-branch */}
          {gymCodes.length > 1 && (
            <Select
              value={selectedBranchFilter}
              onChange={(e) => setSelectedBranchFilter(e.target.value)}
              className="w-48 text-xs font-medium"
            >
              <option value="">All Branches</option>
              {gymCodes.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name || g.code || g.id}
                </option>
              ))}
            </Select>
          )}

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
              placeholder="Filter staff by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-52 pl-8 text-xs"
            />
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHolidaysModalOpen(true)}
            className="h-9 gap-1.5 text-xs font-semibold"
          >
            <Calendar className="h-4 w-4 text-indigo-500" />
            Manage Holidays ({holidays.length})
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={!filteredReports.length}
            className="h-9 gap-1.5 text-xs font-semibold"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200 dark:border-slate-800">
          <CardContent className="p-4">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Base Payroll
            </span>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">
              ₹{(summary?.totalBasePayroll || 0).toLocaleString()}
            </p>
            <span className="text-[11px] text-slate-400">
              Across {summary?.totalStaff || 0} active staff members
            </span>
          </CardContent>
        </Card>

        <Card className="border-amber-200/80 bg-amber-50/20 dark:border-amber-950/40 dark:bg-amber-950/10">
          <CardContent className="p-4">
            <span className="text-xs font-medium text-amber-800 dark:text-amber-300">
              Late Deductions (15m Slabs)
            </span>
            <p className="mt-1 text-2xl font-black text-amber-700 dark:text-amber-400">
              -₹{(summary?.totalLatenessDeductions || 0).toLocaleString()}
            </p>
            <span className="text-[11px] text-amber-700/80 dark:text-amber-400/80">
              {summary?.totalLateInstances || 0} total late instances monitored
            </span>
          </CardContent>
        </Card>

        <Card className="border-rose-200/80 bg-rose-50/20 dark:border-rose-950/40 dark:bg-rose-950/10">
          <CardContent className="p-4">
            <span className="text-xs font-medium text-rose-800 dark:text-rose-300">
              Absence Deductions
            </span>
            <p className="mt-1 text-2xl font-black text-rose-700 dark:text-rose-400">
              -₹{(summary?.totalAbsenceDeductions || 0).toLocaleString()}
            </p>
            <span className="text-[11px] text-rose-700/80 dark:text-rose-400/80">
              Unexcused missed workdays
            </span>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 bg-emerald-50/40 dark:border-emerald-950/60 dark:bg-emerald-950/20">
          <CardContent className="p-4">
            <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
              Net Payable Payroll
            </span>
            <p className="mt-1 text-2xl font-black text-emerald-700 dark:text-emerald-400">
              ₹{(summary?.totalNetPayable || 0).toLocaleString()}
            </p>
            <span className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
              Final amount for {monthName}
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Staff Salary Table */}
      <Card className="border-slate-200 dark:border-slate-800">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : !filteredReports.length ? (
            <div className="py-12 text-center">
              <Users className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-2 font-medium text-slate-700 dark:text-slate-300">
                No staff salary records found for this period.
              </p>
              <p className="text-xs text-slate-400">
                Ensure staff accounts are created and configured in the Staff Directory.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60 font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
                    <th className="px-4 py-3.5">Staff Member</th>
                    <th className="px-4 py-3.5">Shift Timings</th>
                    <th className="px-4 py-3.5">Base Salary</th>
                    <th className="px-4 py-3.5">Attendance Overview</th>
                    <th className="px-4 py-3.5">Lateness Monitored</th>
                    <th className="px-4 py-3.5 text-right">Deductions</th>
                    <th className="px-4 py-3.5 text-right">Net Payable</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredReports.map((r) => {
                    return (
                      <tr
                        key={r.staffId}
                        className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                      >
                        {/* Staff */}
                        <td className="px-4 py-4">
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white">
                              {r.staffName}
                            </span>
                            <p className="text-[11px] text-slate-500">ID: {r.staffId}</p>
                          </div>
                        </td>

                        {/* Shift Timings */}
                        <td className="px-4 py-4">
                          <div>
                            <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              {r.shiftMode === "single_evening"
                                ? `Evening: ${r.shift1Start} - ${r.shift1End}`
                                : r.shiftMode === "single_morning"
                                  ? `Morning: ${r.shift1Start} - ${r.shift1End}`
                                  : `Split: ${r.shift1Start}-${r.shift1End} & ${r.shift2Start || "17:00"}-${r.shift2End || "20:00"}`}
                            </span>
                            <p className="mt-0.5 text-[10px] text-slate-400">
                              Grace: {r.graceMinutes}m • {r.monthlyNoteExemptions} Free Notes / mo
                            </p>
                          </div>
                        </td>

                        {/* Base Salary */}
                        <td className="px-4 py-4 font-semibold text-slate-800 dark:text-slate-200">
                          ₹{r.monthlySalary.toLocaleString()}
                          <p className="text-[10px] font-normal text-slate-400">
                            Daily: ₹{r.dailyWage.toFixed(1)}
                          </p>
                        </td>

                        {/* Attendance Breakdown */}
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                              {r.totalPresentDays} Present
                            </span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              {r.totalWeeklyOffs} Off
                            </span>
                            {r.totalHolidays > 0 && (
                              <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                                {r.totalHolidays} Hol
                              </span>
                            )}
                            {r.totalApprovedLeaves > 0 && (
                              <span className="rounded bg-teal-50 px-1.5 py-0.5 font-medium text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                                {r.totalApprovedLeaves} Leave
                              </span>
                            )}
                            {r.totalAbsentDays > 0 && (
                              <span className="rounded bg-rose-50 px-1.5 py-0.5 font-bold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                                {r.totalAbsentDays} Absent
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Lateness Monitored */}
                        <td className="px-4 py-4">
                          {r.totalLateDays > 0 ? (
                            <div>
                              <span className="font-semibold text-amber-700 dark:text-amber-400">
                                {r.totalLateDays} Late Days
                              </span>
                              <p className="text-[10px] text-slate-500">
                                {r.totalDeductedLateMinutes}m deducted • {r.noteExemptionsUsed} notes
                                used
                              </p>
                            </div>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              ✓ 0 Late Days
                            </span>
                          )}
                        </td>

                        {/* Deductions */}
                        <td className="px-4 py-4 text-right">
                          {r.totalDeductions > 0 ? (
                            <div>
                              <span className="font-bold text-rose-600 dark:text-rose-400">
                                -₹{r.totalDeductions.toLocaleString()}
                              </span>
                              <p className="text-[10px] text-slate-400">
                                Late: ₹{r.totalLatenessDeductionAmount.toFixed(0)} | Abs: ₹
                                {r.totalAbsenceDeductionAmount.toFixed(0)}
                              </p>
                            </div>
                          ) : (
                            <span className="text-slate-400">₹0</span>
                          )}
                        </td>

                        {/* Net Payable */}
                        <td className="px-4 py-4 text-right">
                          <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                            ₹{r.netPayableSalary.toLocaleString()}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setBreakdownReport(r)}
                              className="h-7 border-indigo-200 bg-indigo-50/50 px-2.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300"
                            >
                              Day Breakdown
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openConfigForStaff(r.staffId)}
                              title="Edit Shift & Salary Config"
                              className="h-7 w-7 p-0 text-slate-500 hover:text-slate-800"
                            >
                              <SlidersHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Salary Config Modal */}
      {configModalStaff && (
        <SalaryConfigModal
          open={Boolean(configModalStaff)}
          onClose={() => setConfigModalStaff(null)}
          staffUser={configModalStaff}
          existingProfile={
            configData?.profiles?.[configModalStaff.id] ||
            (configData?.profiles
              ? Object.values(configData.profiles).find(
                  (p) =>
                    p?.staffLoginId?.toLowerCase() === configModalStaff.id?.toLowerCase() ||
                    p?.staffLoginId?.toLowerCase() === configModalStaff.name?.toLowerCase(),
                )
              : null) ||
            null
          }
          onSaved={() => {
            void refetch();
          }}
        />
      )}

      {/* Holidays Modal */}
      <GymHolidaysModal
        open={holidaysModalOpen}
        onClose={() => setHolidaysModalOpen(false)}
        holidays={holidays}
        onUpdated={() => {
          void refetch();
        }}
      />

      {/* Day Breakdown Drawer */}
      {breakdownReport && (
        <StaffDayBreakdownDrawer
          open={Boolean(breakdownReport)}
          onClose={() => setBreakdownReport(null)}
          report={breakdownReport}
          onUpdated={() => {
            void refetch();
          }}
        />
      )}
    </div>
  );
}
