"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { PageHeader, Skeleton, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { useLogs } from "@/hooks/use-data";
import { logsApi } from "@/services/api";
import { downloadTextFile, formatDate } from "@/lib/utils";
import {
  formatAuditActionLabel,
  getChangedFields,
  isoDate,
  logActor,
  logEntrySummary,
  logTimestamp,
  prettyDiffValue,
} from "@/lib/domain/audit-logs";
import { hasAccess, isMasterOwnerUser } from "@/lib/domain/permissions";
import { useAuthStore } from "@/stores";
import type { AuditLog } from "@/types";

const PAGE_SIZE = 25;

function formatLogTime(value?: string) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(value));
  } catch {
    return formatDate(value);
  }
}

export function LogsPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { data: logs = [], isLoading, isFetching, refetch } = useLogs();

  const canView = hasAccess(user, "logs", "viewLogs");
  const canExport = hasAccess(user, "logs", "exportLogs");
  const canClear = hasAccess(user, "logs", "clearLogs");
  const isOwner = isMasterOwnerUser(user);

  const todayIso = isoDate();
  const sevenDaysAgoIso = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return isoDate(d);
  })();

  const [filter, setFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [timeRange, setTimeRange] = useState("all");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState("");
  const [expandedDetail, setExpandedDetail] = useState<
    Record<string, { loading?: boolean; error?: string; data?: AuditLog | null }>
  >({});
  const [rangeModalOpen, setRangeModalOpen] = useState(false);
  const [logsRange, setLogsRange] = useState({ start: sevenDaysAgoIso, end: todayIso });
  const [rangeResult, setRangeResult] = useState<{
    deleted?: number;
    remaining?: number;
    startDate?: string;
    endDate?: string;
  } | null>(null);

  const sinceTs = useMemo(() => {
    if (timeRange === "24h") return Date.now() - 24 * 60 * 60 * 1000;
    if (timeRange === "7d") return Date.now() - 7 * 24 * 60 * 60 * 1000;
    if (timeRange === "30d") return Date.now() - 30 * 24 * 60 * 60 * 1000;
    return 0;
  }, [timeRange]);

  const actors = useMemo(
    () => Array.from(new Set(logs.map((l) => logActor(l)).filter((v) => v && v !== "system"))),
    [logs],
  );
  const actions = useMemo(
    () => Array.from(new Set(logs.map((l) => l.action).filter(Boolean))) as string[],
    [logs],
  );
  const entities = useMemo(
    () => Array.from(new Set(logs.map((l) => l.entityType).filter(Boolean))) as string[],
    [logs],
  );

  const filtered = useMemo(() => {
    const q = filter.toLowerCase().trim();
    return logs.filter((l) => {
      const ts = logTimestamp(l);
      if (sinceTs && ts && new Date(ts).getTime() < sinceTs) return false;
      if (actorFilter && logActor(l) !== actorFilter) return false;
      if (actionFilter && l.action !== actionFilter) return false;
      if (entityFilter && l.entityType !== entityFilter) return false;
      if (!q) return true;
      const blob = [
        l.entityId,
        l.action,
        logActor(l),
        l.entityType,
        JSON.stringify(l.before || {}),
        JSON.stringify(l.after || {}),
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [logs, filter, actorFilter, actionFilter, entityFilter, sinceTs]);

  useEffect(() => {
    setPage(1);
  }, [filter, actorFilter, actionFilter, entityFilter, timeRange, logs.length]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = page > totalPages ? 1 : page;
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const alertCount = filtered.filter((l) => {
    const a = String(l.action || "");
    return a.includes("deleted") || a.includes("blocked");
  }).length;

  const resolveEntry = (entry: AuditLog) => {
    const detail = expandedDetail[entry.id]?.data;
    return detail ? { ...entry, ...detail } : entry;
  };

  useEffect(() => {
    if (!expandedId) return;
    const cached = expandedDetail[expandedId];
    if (cached?.data || cached?.loading) return;
    let cancelled = false;
    setExpandedDetail((prev) => ({
      ...prev,
      [expandedId]: { loading: true, error: "", data: null },
    }));
    logsApi
      .get(expandedId)
      .then((detail) => {
        if (cancelled) return;
        setExpandedDetail((prev) => ({
          ...prev,
          [expandedId]: { loading: false, error: "", data: detail },
        }));
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setExpandedDetail((prev) => ({
          ...prev,
          [expandedId]: {
            loading: false,
            error: err.message || "Could not load log detail",
            data: null,
          },
        }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId]);

  const clearAll = useMutation({
    mutationFn: () =>
      logsApi.cleanup({ startDate: "1970-01-01", endDate: "2099-12-31" }),
    onSuccess: async (res) => {
      toast.success(`Cleared ${res.deleted ?? 0} logs`);
      await qc.invalidateQueries({ queryKey: ["logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clearRange = useMutation({
    mutationFn: () =>
      logsApi.cleanup({
        startDate: logsRange.start.slice(0, 10),
        endDate: logsRange.end.slice(0, 10),
      }),
    onSuccess: async (res) => {
      setRangeResult(res);
      toast.success(`Removed ${res.deleted ?? 0} logs`);
      await qc.invalidateQueries({ queryKey: ["logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = () => {
    if (!canExport) return;
    const header = ["Time", "Actor", "Action", "Entity Type", "Entity ID", "Before", "After"];
    const rows = filtered.map((l) => [
      logTimestamp(l),
      logActor(l),
      l.action || "",
      l.entityType || "",
      l.entityId || "",
      JSON.stringify(l.before || {}),
      JSON.stringify(l.after || {}),
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    downloadTextFile(`audit-logs-${isoDate()}.csv`, csv);
  };

  if (!canView) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Audit logs access is disabled for this profile.
      </div>
    );
  }

  if (isLoading) return <Skeleton className="h-96" />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit Command Center"
        description={`Log Health: Operational · Total (${timeRange}): ${filtered.length} · Security Alerts: ${alertCount}`}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {isOwner && canClear ? (
              <Button
                variant="outline"
                size="sm"
                className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                onClick={() => {
                  setRangeResult(null);
                  setLogsRange({ start: sevenDaysAgoIso, end: todayIso });
                  setRangeModalOpen(true);
                }}
              >
                Delete by Date Range
              </Button>
            ) : null}
            {isOwner && canClear ? (
              <Button
                variant="destructive"
                size="sm"
                disabled={clearAll.isPending}
                onClick={() => {
                  if (confirm("Clear ALL audit logs? This cannot be undone.")) {
                    clearAll.mutate();
                  }
                }}
              >
                Clear Logs
              </Button>
            ) : null}
            {canExport ? (
              <Button size="sm" onClick={exportCsv}>
                Export CSV
              </Button>
            ) : null}
          </>
        }
      />

      <Card className="border-slate-200 shadow-sm dark:border-border">
        <CardContent className="grid gap-2 p-4 md:grid-cols-5">
          <Input
            placeholder="Search actor, action, entity…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <Select value={actorFilter} onChange={(e) => setActorFilter(e.target.value)}>
            <option value="">All actors</option>
            {actors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
          <Select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a} title={a}>
                {formatAuditActionLabel(a)}
              </option>
            ))}
          </Select>
          <Select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
            <option value="">All entities</option>
            {entities.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </Select>
          <Select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
            <option value="all">All time</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </Select>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-slate-200 shadow-sm dark:border-border">
        <CardContent className="overflow-x-auto p-0">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-600 dark:bg-muted dark:text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Time</th>
                <th className="px-4 py-3 font-semibold">Actor</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Entity</th>
                <th className="px-4 py-3 font-semibold">Summary</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((raw) => {
                const l = resolveEntry(raw);
                const open = expandedId === l.id;
                const detailState = expandedDetail[l.id];
                const changes = getChangedFields(l);
                return (
                  <Fragment key={l.id}>
                    <tr
                      className="cursor-pointer border-t border-slate-100 hover:bg-slate-50/80 dark:border-border dark:hover:bg-muted/40"
                      onClick={() => setExpandedId(open ? "" : l.id)}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                        {formatLogTime(logTimestamp(l))}
                      </td>
                      <td className="px-4 py-3 font-medium">{logActor(l)}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium dark:bg-muted">
                          {formatAuditActionLabel(l.action)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div>{l.entityType || "—"}</div>
                        <div className="text-muted-foreground">{l.entityId || ""}</div>
                      </td>
                      <td className="max-w-md truncate px-4 py-3 text-xs text-slate-600">
                        {logEntrySummary(l) || "—"}
                      </td>
                    </tr>
                    {open ? (
                      <tr className="border-t border-slate-100 bg-slate-50/50 dark:border-border dark:bg-muted/20">
                        <td colSpan={5} className="px-4 py-3">
                          {detailState?.loading ? (
                            <p className="text-xs text-muted-foreground">Loading detail…</p>
                          ) : null}
                          {detailState?.error ? (
                            <p className="text-xs text-rose-700">{detailState.error}</p>
                          ) : null}
                          {changes.length ? (
                            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-border dark:bg-card">
                              <table className="min-w-full text-xs">
                                <thead>
                                  <tr className="bg-slate-50 text-left dark:bg-muted">
                                    <th className="px-3 py-2 font-semibold">Field</th>
                                    <th className="px-3 py-2 font-semibold">Before</th>
                                    <th className="px-3 py-2 font-semibold">After</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {changes.slice(0, 40).map((c) => (
                                    <tr
                                      key={c.key}
                                      className="border-t border-slate-100 dark:border-border"
                                    >
                                      <td className="px-3 py-1.5 font-medium">{c.key}</td>
                                      <td className="max-w-xs truncate px-3 py-1.5 text-rose-700">
                                        {prettyDiffValue(c.before)}
                                      </td>
                                      <td className="max-w-xs truncate px-3 py-1.5 text-emerald-700">
                                        {prettyDiffValue(c.after)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {changes.length > 40 ? (
                                <p className="px-3 py-2 text-[11px] text-muted-foreground">
                                  Showing 40 of {changes.length} changed fields.
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              No field-level changes in this entry.
                            </p>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {!pageRows.length ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10">
                    <EmptyState title="No audit logs match these filters" />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
        {filtered.length > PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-xs dark:border-border">
            <span className="text-muted-foreground">
              Page {safePage} of {totalPages} · {filtered.length} rows
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      {rangeModalOpen && isOwner ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-4 shadow-xl dark:bg-card">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Delete Logs by Date Range</h3>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-muted"
                onClick={() => setRangeModalOpen(false)}
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Removes every audit log whose timestamp falls inside this range. The purge audit
              entry is written after cleanup so it survives.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs">
                Start
                <Input
                  type="date"
                  className="mt-1"
                  value={logsRange.start}
                  onChange={(e) => setLogsRange((r) => ({ ...r, start: e.target.value }))}
                />
              </label>
              <label className="text-xs">
                End
                <Input
                  type="date"
                  className="mt-1"
                  value={logsRange.end}
                  onChange={(e) => setLogsRange((r) => ({ ...r, end: e.target.value }))}
                />
              </label>
            </div>
            {rangeResult ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                Removed {rangeResult.deleted} entries between {rangeResult.startDate} and{" "}
                {rangeResult.endDate}. {rangeResult.remaining} remain.
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRangeModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={clearRange.isPending || !logsRange.start || !logsRange.end}
                onClick={() => clearRange.mutate()}
              >
                {clearRange.isPending ? "Deleting…" : "Delete range"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
