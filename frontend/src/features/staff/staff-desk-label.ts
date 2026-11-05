"use client";

import { useMemo } from "react";
import { useAttendance, useSettings } from "@/hooks/use-data";
import { attendanceRecordKey } from "@/lib/domain/attendance-records";
import { attendanceTodayCalendarKey } from "@/lib/domain/attendance";
import {
  buildStaffLoginAliasMap,
  leaveRequestMatchesStaff,
  normalizeLeaveRequest,
  normalizeLeaveStatus,
} from "@/lib/domain/leave";
import type { AttendanceRecord, LeaveRequest, StaffUser } from "@/types";

export type StaffDeskLabel = "In today" | "On leave";

export function staffDeskLabelFor(input: {
  staffId: string;
  today: string;
  records: AttendanceRecord[];
  requests: LeaveRequest[];
  aliasMap: Map<string, string>;
}): StaffDeskLabel | null {
  const staffId = String(input.staffId || "").trim();
  if (!staffId) return null;
  const onLeave = input.requests.some((req) => {
    if (normalizeLeaveStatus(req.status) !== "Approved") return false;
    if (!leaveRequestMatchesStaff(req.userId || req.staffId, staffId, input.aliasMap)) return false;
    const start = String(req.startDate || req.fromDate || "").slice(0, 10);
    const end = String(req.endDate || req.toDate || "").slice(0, 10);
    return Boolean(start && end && start <= input.today && input.today <= end);
  });
  const status = String(
    input.records.find(
      (row) =>
        attendanceRecordKey(row.date, row.userId || row.staffId) ===
        attendanceRecordKey(input.today, staffId),
    )?.status || "",
  ).trim();
  if (onLeave || status === "Leave") return "On leave";
  if (status === "Present" || status === "Half Day") return "In today";
  return null;
}

export function useStaffDeskLabels(users: StaffUser[]) {
  const today = attendanceTodayCalendarKey();
  const { data: records = [] } = useAttendance({ startDate: today, endDate: today });
  const { data: settings } = useSettings();
  return useMemo(() => {
    const aliasMap = buildStaffLoginAliasMap(users);
    const requests = ((settings?.leaveRequests || []) as LeaveRequest[]).map((row) =>
      normalizeLeaveRequest(row),
    );
    const labels = new Map<string, StaffDeskLabel>();
    for (const user of users) {
      const label = staffDeskLabelFor({
        staffId: user.id,
        today,
        records,
        requests,
        aliasMap,
      });
      if (label) labels.set(user.id, label);
    }
    return labels;
  }, [users, records, settings?.leaveRequests, today]);
}
