"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Badge, EmptyState, PageHeader, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { useAttendance, useSettings, useUsers } from "@/hooks/use-data";
import { attendanceApi } from "@/services/api";
import { cn, formatDate } from "@/lib/utils";
import { hasAccess } from "@/lib/domain/permissions";
import { formatDateTimeTz } from "@/lib/domain/member-actions";
import { localTodayCalendarKey } from "@/lib/domain/billing";
import {
  formatAttendanceNoteBadge,
  isAttendanceNotesEnabled,
  isAttendancePresenceQrEnabled,
} from "@/lib/domain/attendance";
import {
  attendanceRecordKey,
  notesDefaultRange,
  statusTone,
} from "@/lib/domain/attendance-records";
import { useAuthStore } from "@/stores";
import type { AttendanceNote, AttendanceRecord, StaffUser } from "@/types";

const STATUSES = ["Present", "Absent", "Half Day", "Leave"] as const;
const HISTORY_PAGE_SIZE = 5;
const RECORDS_PAGE_SIZE = 10;

function staffName(users: StaffUser[], userId?: string) {
  const hit = users.find((u) => u.id === userId);
  return hit?.name || userId || "—";
}

export function AttendancePage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const displayTz = "IST";
  const today = localTodayCalendarKey();
  const [date, setDate] = useState(today);
  const [expandedStaffId, setExpandedStaffId] = useState("");
  const [historyPageByStaff, setHistoryPageByStaff] = useState<Record<string, number>>({});
  const [recordsPage, setRecordsPage] = useState(1);
  const [clearOpen, setClearOpen] = useState(false);
  const defaultClearStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);
  const [clearRange, setClearRange] = useState({ start: "", end: today });
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const isOwner =
    String(user?.id || "").toLowerCase() === "owner" ||
    String(user?.staffRole || "").toLowerCase() === "master_owner";

  const canView = hasAccess(user, "attendance", "viewAttendance");
  const canMarkAll = hasAccess(user, "attendance", "markAllPresent");
  const canEdit = hasAccess(user, "attendance", "editAttendance");

  const { data: records = [], isLoading } = useAttendance();
  const { data: users = [] } = useUsers();
  const { data: settings } = useSettings();
  const notesEnabled = isAttendanceNotesEnabled(settings as Record<string, unknown>);
  const attendanceQrEnabled = isAttendancePresenceQrEnabled(settings as Record<string, unknown>);

  const notesRange = notesDefaultRange();
  const { data: attendanceNotes = [] } = useQuery({
    queryKey: ["attendance-notes", notesRange.startDate, notesRange.endDate],
    queryFn: () =>
      attendanceApi.notes({
        startDate: notesRange.startDate,
        endDate: notesRange.endDate,
      }),
    enabled: Boolean(user) && notesEnabled && canView,
  });

  const staff = useMemo(
    () => (users || []).filter((u) => !u.blocked),
    [users],
  );

  const recordMap = useMemo(() => {
    const out = new Map<string, AttendanceRecord>();
    for (const r of records || []) {
      out.set(attendanceRecordKey(r.date, r.userId || r.staffId), r);
    }
    return out;
  }, [records]);

  const latestNoteByStaffDate = useMemo(() => {
    const out = new Map<string, AttendanceNote>();
    for (const n of attendanceNotes || []) {
      const staffId = String(n.staffLoginId || "").trim().toLowerCase();
      const key = `${String(n.attendanceDate || "").slice(0, 10)}__${staffId}`;
      if (!staffId || out.has(key)) continue;
      out.set(key, n);
    }
    return out;
  }, [attendanceNotes]);

  const noteKey = (recordDate: string, userId: string) =>
    `${recordDate}__${String(userId || "").trim().toLowerCase()}`;

  const twoMonthCutoff = useMemo(() => {
    const base = new Date();
    base.setMonth(base.getMonth() - 2);
    return base;
  }, []);

  const historyByUser = useMemo(() => {
    const out: Record<string, AttendanceRecord[]> = {};
    for (const s of staff) out[s.id] = [];
    for (const r of records || []) {
      const uid = String(r.userId || r.staffId || "");
      if (!out[uid]) continue;
      const dt = new Date(String(r.date || ""));
      if (!Number.isNaN(dt.getTime()) && dt >= twoMonthCutoff) out[uid].push(r);
    }
    for (const uid of Object.keys(out)) {
      out[uid].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    }
    return out;
  }, [records, staff, twoMonthCutoff]);

  const presentCount = staff.filter(
    (s) => (recordMap.get(attendanceRecordKey(date, s.id))?.status || "Absent") === "Present",
  ).length;
  const leaveCount = staff.filter(
    (s) => (recordMap.get(attendanceRecordKey(date, s.id))?.status || "") === "Leave",
  ).length;

  const upsertMutation = useMutation({
    mutationFn: async ({ userId, patch }: { userId: string; patch: Partial<AttendanceRecord> }) => {
      const existing = records.find(
        (r) =>
          String(r.date || "").slice(0, 10) === date &&
          String(r.userId || r.staffId || "") === userId,
      );
      const nowIso = new Date().toISOString();
      const actor = String(user?.name || user?.id || "").trim();
      const saved: AttendanceRecord = existing
        ? { ...existing, ...patch, updatedAt: nowIso, updatedBy: actor }
        : {
            id:
              typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                ? crypto.randomUUID()
                : `att-${Date.now()}`,
            date,
            userId,
            status: "Present",
            checkIn: "",
            checkOut: "",
            note: "",
            markedBy: actor,
            ...patch,
            updatedAt: nowIso,
            updatedBy: actor,
          };
      await attendanceApi.saveRecords([saved]);
      return saved;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not update attendance"),
  });

  const markAllMutation = useMutation({
    mutationFn: async () => {
      const nowIso = new Date().toISOString();
      const actor = String(user?.name || user?.id || "").trim();
      const next = staff.map((s) => {
        const existing = recordMap.get(attendanceRecordKey(date, s.id));
        return {
          ...(existing || {
            id:
              typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                ? crypto.randomUUID()
                : `att-${Date.now()}-${s.id}`,
            date,
            userId: s.id,
            checkIn: "",
            checkOut: "",
            note: "",
            markedBy: actor,
          }),
          status: "Present",
          updatedAt: nowIso,
          updatedBy: actor,
        } as AttendanceRecord;
      });
      await attendanceApi.saveRecords(next);
    },
    onSuccess: async () => {
      toast.success("Marked all present");
      await qc.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (e: Error) => toast.error(e.message || "Mark all failed"),
  });

  const clearMutation = useMutation({
    mutationFn: async () =>
      attendanceApi.cleanup({
        startDate: clearRange.start,
        endDate: clearRange.end,
      }),
    onSuccess: async (res) => {
      toast.success(`Cleared ${res.deleted ?? 0} attendance records`);
      setClearOpen(false);
      await qc.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (e: Error) => toast.error(e.message || "Cleanup failed"),
  });

  const sortedLedger = useMemo(
    () =>
      [...(records || [])].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))),
    [records],
  );
  const ledgerTotalPages = Math.max(1, Math.ceil(sortedLedger.length / RECORDS_PAGE_SIZE));
  const safeLedgerPage = Math.min(Math.max(1, recordsPage), ledgerTotalPages);
  const ledgerRows = sortedLedger.slice(
    (safeLedgerPage - 1) * RECORDS_PAGE_SIZE,
    safeLedgerPage * RECORDS_PAGE_SIZE,
  );

  if (!canView) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        Attendance dashboard access is disabled for this profile.
      </div>
    );
  }

  if (isLoading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Attendance"
        description="Daily staff attendance with first-login and last-logout tracking."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 w-auto"
            />
            {canMarkAll ? (
              <Button
                onClick={() => markAllMutation.mutate()}
                disabled={markAllMutation.isPending}
              >
                Mark All Present
              </Button>
            ) : null}
            {attendanceQrEnabled ? (
              <Button
                variant="outline"
                onClick={() => {
                  window.location.href = "/attendance/kiosk";
                }}
              >
                Attendance QR
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm dark:border-emerald-900 dark:from-emerald-950/40 dark:to-card">
          <div className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Present</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-900 dark:text-emerald-100">
            {presentCount}
          </div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm dark:border-amber-900 dark:from-amber-950/40 dark:to-card">
          <div className="text-xs font-medium text-amber-700 dark:text-amber-300">On Leave</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-amber-900 dark:text-amber-100">
            {leaveCount}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm dark:border-border dark:from-muted/40 dark:to-card">
          <div className="text-xs font-medium text-slate-600 dark:text-muted-foreground">
            Total Staff
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-foreground">
            {staff.length}
          </div>
        </div>
      </div>

      <Card className="overflow-hidden border-slate-200 shadow-sm dark:border-border">
        <CardContent className="space-y-2 p-3 sm:p-4">
          {!staff.length ? (
            <EmptyState title="No staff" description="Add staff users to track attendance." />
          ) : (
            staff.map((s) => {
              const rec = recordMap.get(attendanceRecordKey(date, s.id)) || {};
              const isOpen = expandedStaffId === s.id;
              const historyRows = historyByUser[s.id] || [];
              const totalPages = Math.max(1, Math.ceil(historyRows.length / HISTORY_PAGE_SIZE));
              const currentPage = Math.min(
                Math.max(1, Number(historyPageByStaff[s.id] || 1)),
                totalPages,
              );
              const visibleRows = historyRows.slice(
                (currentPage - 1) * HISTORY_PAGE_SIZE,
                currentPage * HISTORY_PAGE_SIZE,
              );
              const noteRow = notesEnabled
                ? latestNoteByStaffDate.get(noteKey(date, s.id))
                : undefined;

              return (
                <div
                  key={s.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-border dark:bg-card"
                >
                  <button
                    type="button"
                    onClick={() => setExpandedStaffId((prev) => (prev === s.id ? "" : s.id))}
                    className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left transition hover:bg-slate-50/80 dark:hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900 dark:text-foreground">
                        {s.name || s.id}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-muted-foreground">{s.id}</div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                          statusTone(rec.status || "Absent"),
                        )}
                      >
                        {rec.status || "Absent"}
                      </span>
                      {rec.firstLoginAt || rec.lastLogoutAt ? (
                        <span className="max-w-[220px] truncate text-[10px] text-slate-500">
                          {rec.firstLoginAt
                            ? `In ${formatDateTimeTz(rec.firstLoginAt, displayTz)}`
                            : ""}
                          {rec.firstLoginAt && rec.lastLogoutAt ? " · " : ""}
                          {rec.lastLogoutAt
                            ? `Out ${formatDateTimeTz(rec.lastLogoutAt, displayTz)}`
                            : ""}
                        </span>
                      ) : null}
                      {noteRow ? (
                        <span
                          className="max-w-[160px] truncate rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800"
                          title={String(noteRow.note || "")}
                        >
                          {formatAttendanceNoteBadge(noteRow)}
                        </span>
                      ) : null}
                      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-slate-500">
                        {isOpen ? (
                          <>
                            Hide <ChevronUp className="h-3.5 w-3.5" />
                          </>
                        ) : (
                          <>
                            Expand <ChevronDown className="h-3.5 w-3.5" />
                          </>
                        )}
                      </span>
                    </div>
                  </button>

                  {isOpen ? (
                    <div className="space-y-3 border-t border-slate-100 p-3 dark:border-border">
                      <div className="grid grid-cols-1 gap-2 lg:grid-cols-4">
                        <div>
                          <Label className="text-xs text-muted-foreground">Status</Label>
                          <Select
                            className="mt-1"
                            disabled={!canEdit || upsertMutation.isPending}
                            value={String(rec.status || "Absent")}
                            onChange={(e) =>
                              canEdit &&
                              upsertMutation.mutate({
                                userId: s.id,
                                patch: { status: e.target.value },
                              })
                            }
                          >
                            {STATUSES.map((st) => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </Select>
                          {rec.leaveAutoSynced ? (
                            <Badge variant="muted" className="mt-1 border-violet-300 bg-violet-50 text-violet-700">
                              Synced from Leave
                            </Badge>
                          ) : null}
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">First Login In</Label>
                          <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-border dark:bg-muted/40">
                            {rec.firstLoginAt ? (
                              <>
                                {formatDateTimeTz(rec.firstLoginAt, displayTz)}{" "}
                                <span className="text-[10px] uppercase text-slate-400">
                                  {displayTz}
                                </span>
                              </>
                            ) : (
                              "—"
                            )}
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Last Logout</Label>
                          <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-border dark:bg-muted/40">
                            {rec.lastLogoutAt ? (
                              <>
                                {formatDateTimeTz(rec.lastLogoutAt, displayTz)}{" "}
                                <span className="text-[10px] uppercase text-slate-400">
                                  {displayTz}
                                </span>
                              </>
                            ) : (
                              "—"
                            )}
                          </div>
                        </div>
                        <div className="lg:col-span-4">
                          <Label className="text-xs text-muted-foreground">
                            Note{notesEnabled ? " (legacy — leave sync / admin)" : ""}
                          </Label>
                          <Input
                            className="mt-1"
                            disabled={!canEdit || upsertMutation.isPending}
                            value={
                              noteDrafts[s.id] ??
                              String(rec.note || rec.notes || "")
                            }
                            placeholder="Reason / shift notes"
                            onChange={(e) =>
                              setNoteDrafts((prev) => ({ ...prev, [s.id]: e.target.value }))
                            }
                            onBlur={(e) => {
                              if (!canEdit) return;
                              const value = e.target.value;
                              const current = String(rec.note || rec.notes || "");
                              if (value === current) return;
                              upsertMutation.mutate({
                                userId: s.id,
                                patch: { note: value },
                              });
                            }}
                          />
                        </div>
                        {noteRow ? (
                          <div className="lg:col-span-4">
                            <Label className="text-xs text-muted-foreground">Structured note</Label>
                            <div className="mt-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                              {String(noteRow.note || "")}
                            </div>
                          </div>
                        ) : null}
                        {rec.autoMarked && rec.autoPresentWindowUntil ? (
                          <div className="lg:col-span-4">
                            <span className="inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              Auto Present 24h until{" "}
                              {formatDateTimeTz(rec.autoPresentWindowUntil, displayTz)}{" "}
                              <span className="uppercase">{displayTz}</span>
                            </span>
                          </div>
                        ) : null}
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 dark:border-border dark:bg-muted/20">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-semibold">Last 2 Months Attendance</div>
                          <div className="text-xs text-muted-foreground">
                            Showing {visibleRows.length} of {historyRows.length}
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-xs">
                            <thead>
                              <tr className="bg-slate-100 text-slate-700 dark:bg-muted dark:text-muted-foreground">
                                <th className="px-2 py-1.5 text-left font-semibold">Date</th>
                                <th className="px-2 py-1.5 text-left font-semibold">Status</th>
                                <th className="px-2 py-1.5 text-left font-semibold">First Login</th>
                                <th className="px-2 py-1.5 text-left font-semibold">Last Logout</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visibleRows.map((row) => (
                                <tr
                                  key={String(row.id || `${row.date}-${row.userId}`)}
                                  className="border-t border-slate-200 dark:border-border"
                                >
                                  <td className="whitespace-nowrap px-2 py-1.5">
                                    {formatDate(row.date)}
                                  </td>
                                  <td className="whitespace-nowrap px-2 py-1.5">
                                    {row.status || "Absent"}
                                  </td>
                                  <td className="whitespace-nowrap px-2 py-1.5">
                                    {row.firstLoginAt
                                      ? formatDateTimeTz(row.firstLoginAt, displayTz)
                                      : "—"}
                                  </td>
                                  <td className="whitespace-nowrap px-2 py-1.5">
                                    {row.lastLogoutAt
                                      ? formatDateTimeTz(row.lastLogoutAt, displayTz)
                                      : "—"}
                                  </td>
                                </tr>
                              ))}
                              {!visibleRows.length ? (
                                <tr>
                                  <td
                                    colSpan={4}
                                    className="px-2 py-3 text-center text-muted-foreground"
                                  >
                                    No attendance entries for the last 2 months.
                                  </td>
                                </tr>
                              ) : null}
                            </tbody>
                          </table>
                        </div>
                        {historyRows.length > HISTORY_PAGE_SIZE ? (
                          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              Page {currentPage} / {totalPages}
                            </span>
                            <div className="flex gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={currentPage <= 1}
                                onClick={() =>
                                  setHistoryPageByStaff((prev) => ({
                                    ...prev,
                                    [s.id]: Math.max(1, currentPage - 1),
                                  }))
                                }
                              >
                                Prev
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={currentPage >= totalPages}
                                onClick={() =>
                                  setHistoryPageByStaff((prev) => ({
                                    ...prev,
                                    [s.id]: Math.min(totalPages, currentPage + 1),
                                  }))
                                }
                              >
                                Next
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm dark:border-border">
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">Attendance Records</h2>
              <p className="text-xs text-muted-foreground">
                Newest first · 10 per page · {sortedLedger.length} total
              </p>
            </div>
            {isOwner ? (
              <Button
                size="sm"
                variant="outline"
                className="border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                onClick={() => {
                  setClearRange({ start: defaultClearStart, end: today });
                  setClearOpen(true);
                }}
              >
                Owner Only · Clear Records
              </Button>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-border">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 dark:bg-muted dark:text-muted-foreground">
                  <th className="px-3 py-2 text-left font-semibold">Date</th>
                  <th className="px-3 py-2 text-left font-semibold">Staff</th>
                  <th className="px-3 py-2 text-left font-semibold">Status</th>
                  <th className="px-3 py-2 text-left font-semibold">First Login</th>
                  <th className="px-3 py-2 text-left font-semibold">Last Logout</th>
                  <th className="px-3 py-2 text-left font-semibold">Updated</th>
                  {notesEnabled ? (
                    <th className="px-3 py-2 text-left font-semibold">Note</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {ledgerRows.map((r) => {
                  const uid = String(r.userId || r.staffId || "");
                  const note =
                    notesEnabled
                      ? latestNoteByStaffDate.get(
                          noteKey(String(r.date || "").slice(0, 10), uid),
                        )
                      : undefined;
                  return (
                    <tr
                      key={String(r.id || `${r.date}-${uid}`)}
                      className="border-t border-slate-100 dark:border-border"
                    >
                      <td className="whitespace-nowrap px-3 py-2">{formatDate(r.date)}</td>
                      <td className="whitespace-nowrap px-3 py-2">{staffName(staff, uid)}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span
                          className={cn(
                            "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                            statusTone(r.status),
                          )}
                        >
                          {r.status || "Absent"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {r.firstLoginAt ? formatDateTimeTz(r.firstLoginAt, displayTz) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {r.lastLogoutAt ? formatDateTimeTz(r.lastLogoutAt, displayTz) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {r.updatedAt ? formatDateTimeTz(r.updatedAt, displayTz) : "—"}
                      </td>
                      {notesEnabled ? (
                        <td className="max-w-[180px] truncate px-3 py-2" title={String(note?.note || r.note || "")}>
                          {note
                            ? formatAttendanceNoteBadge(note)
                            : String(r.note || r.notes || "—")}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
                {!ledgerRows.length ? (
                  <tr>
                    <td
                      colSpan={notesEnabled ? 7 : 6}
                      className="px-3 py-8 text-center text-muted-foreground"
                    >
                      No attendance records in range.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {ledgerTotalPages > 1 ? (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Page {safeLedgerPage} of {ledgerTotalPages}
              </span>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={safeLedgerPage <= 1}
                  onClick={() => setRecordsPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={safeLedgerPage >= ledgerTotalPages}
                  onClick={() => setRecordsPage((p) => Math.min(ledgerTotalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {clearOpen ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setClearOpen(false)}
        >
          <div
            className="w-full max-w-md space-y-3 rounded-2xl border bg-background p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-rose-800">Clear attendance records</h2>
            <p className="text-sm text-muted-foreground">
              Permanently delete attendance rows in this date range. Owner only.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={clearRange.start}
                  onChange={(e) => setClearRange((r) => ({ ...r, start: e.target.value }))}
                />
              </div>
              <div>
                <Label>End</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={clearRange.end}
                  onChange={(e) => setClearRange((r) => ({ ...r, end: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setClearOpen(false)}>
                Cancel
              </Button>
              <Button
                className="bg-rose-600 hover:bg-rose-700"
                disabled={clearMutation.isPending}
                onClick={() => clearMutation.mutate()}
              >
                {clearMutation.isPending ? "Clearing…" : "Clear range"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
