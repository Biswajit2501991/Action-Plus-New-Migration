import { apiFetch } from "@/services/api/client";
import type {
  GymHoliday,
  MonthlySalaryCalculatorResponse,
  SalaryManualOverride,
  StaffSalaryProfile,
} from "@/types";

export const salaryCalculatorApi = {
  getConfig: () =>
    apiFetch<{
      ok: boolean;
      profiles: Record<string, StaffSalaryProfile>;
      holidays: GymHoliday[];
      overrides: SalaryManualOverride[];
    }>("/salary-calculator/config"),

  saveProfile: (staffId: string, profile: Partial<StaffSalaryProfile>) =>
    apiFetch<{ ok: boolean; profile: StaffSalaryProfile }>(
      `/salary-calculator/profile/${encodeURIComponent(staffId)}`,
      {
        method: "PUT",
        body: JSON.stringify(profile),
      },
    ),

  saveHoliday: (holiday: Partial<GymHoliday>) =>
    apiFetch<{ ok: boolean; holiday: GymHoliday }>("/salary-calculator/holiday", {
      method: "POST",
      body: JSON.stringify(holiday),
    }),

  deleteHoliday: (holidayId: string) =>
    apiFetch<{ ok: boolean; deleted: string }>(
      `/salary-calculator/holiday/${encodeURIComponent(holidayId)}`,
      {
        method: "DELETE",
      },
    ),

  saveOverride: (override: Partial<SalaryManualOverride>) =>
    apiFetch<{ ok: boolean; override: SalaryManualOverride }>(
      "/salary-calculator/override",
      {
        method: "POST",
        body: JSON.stringify(override),
      },
    ),

  deleteOverride: (staffId: string, date: string) =>
    apiFetch<{ ok: boolean }>(
      `/salary-calculator/override?staffId=${encodeURIComponent(staffId)}&date=${encodeURIComponent(date)}`,
      {
        method: "DELETE",
      },
    ),

  getMonthlyReport: (params: {
    year?: number;
    month?: number;
    staffId?: string;
    gymCodeId?: string;
  }) => {
    const q = new URLSearchParams();
    if (params.year) q.set("year", String(params.year));
    if (params.month) q.set("month", String(params.month));
    if (params.staffId) q.set("staffId", params.staffId);
    if (params.gymCodeId) q.set("gymCodeId", params.gymCodeId);
    return apiFetch<MonthlySalaryCalculatorResponse>(
      `/salary-calculator/monthly-report?${q.toString()}`,
    );
  },
};
