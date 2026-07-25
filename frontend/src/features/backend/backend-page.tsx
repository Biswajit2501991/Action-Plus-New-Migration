"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader, Skeleton, StatCard } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { financeApi, getSupervisorBaseUrl, systemApi } from "@/services/api";
import { authFetchCredentials } from "@/lib/auth-cookie-mode";
import { readAuthToken } from "@/lib/auth-storage";
import { hasAccess, isMasterOwnerUser } from "@/lib/domain/permissions";
import { useAuthStore } from "@/stores";
import type { StorageUsage } from "@/services/api";

function bytesToMb(n?: number) {
  return (Number(n || 0) / (1024 * 1024)).toFixed(2);
}

function supervisorHeaders(): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = readAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export function BackendPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const canView = hasAccess(user, "backend", "viewBackendPage");
  const canControl = hasAccess(user, "backend", "controlBackendProcesses");
  const canDisk = hasAccess(user, "settings", "viewBackendDiskUsage");
  const isOwner = isMasterOwnerUser(user);

  const supervisorBase = useMemo(() => getSupervisorBaseUrl(), []);

  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [healthMeta, setHealthMeta] = useState<Record<string, unknown> | null>(null);
  const [supervisorOk, setSupervisorOk] = useState<boolean | null>(null);
  const [lastCheck, setLastCheck] = useState("");
  const [busy, setBusy] = useState("");
  const [financeCheck, setFinanceCheck] = useState<{
    ok: boolean;
    month?: string;
    collectedRevenue?: number;
    revenueBasis?: string;
    status?: number;
    message?: string;
  } | null>(null);

  const [selectedBackup, setSelectedBackup] = useState("");
  const [pruneDays, setPruneDays] = useState("30");
  const [keepCount, setKeepCount] = useState("10");
  const [backupPage, setBackupPage] = useState(1);
  const backupPageSize = 12;

  const storageQuery = useQuery({
    queryKey: ["storage"],
    queryFn: systemApi.storage,
    enabled: canView && canDisk && isOwner,
    retry: false,
    refetchInterval: 30_000,
  });

  const backupsQuery = useQuery({
    queryKey: ["backups"],
    queryFn: async () => {
      const res = await systemApi.backups();
      return Array.isArray(res?.backups) ? res.backups : [];
    },
    enabled: canView && canDisk && isOwner,
    retry: false,
    refetchInterval: 30_000,
  });

  const storage = (storageQuery.data || {}) as StorageUsage;
  const backups = backupsQuery.data || [];
  const backupPages = Math.max(1, Math.ceil(backups.length / backupPageSize));
  const pagedBackups = backups.slice(
    (backupPage - 1) * backupPageSize,
    backupPage * backupPageSize,
  );

  const pingHealth = useCallback(async () => {
    const ts = new Date().toLocaleTimeString([], { hour12: false });
    let apiUp = false;
    let meta: Record<string, unknown> | null = null;
    try {
      meta = await systemApi.health();
      apiUp = true;
    } catch {
      apiUp = false;
    }
    let supUp: boolean | null = null;
    if (supervisorBase) {
      try {
        const sres = await fetch(`${supervisorBase}/health`, {
          cache: "no-store",
          credentials: authFetchCredentials(),
          headers: supervisorHeaders(),
        });
        supUp = sres.ok;
      } catch {
        supUp = false;
      }
    }
    setHealthOk(apiUp);
    setHealthMeta(meta);
    setSupervisorOk(supUp);
    setLastCheck(ts);
    return apiUp;
  }, [supervisorBase]);

  useEffect(() => {
    if (canView) void pingHealth();
  }, [canView, pingHealth]);

  const verifyFinanceApi = async () => {
    if (!hasAccess(user, "finance", "viewRevenueAutoMembers")) {
      setFinanceCheck({
        ok: false,
        message: "Finance API check skipped — no finance read permission on this profile.",
      });
      return;
    }
    const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    try {
      const body = await financeApi.summary(month);
      setFinanceCheck({
        ok: true,
        status: 200,
        month,
        collectedRevenue: Number(body?.collectedRevenue ?? 0),
        revenueBasis: String(body?.revenueBasis || ""),
      });
    } catch (err) {
      const e = err as Error & { status?: number };
      setFinanceCheck({
        ok: false,
        status: Number(e.status) || 0,
        month,
        message: e.message || String(err),
      });
    }
  };

  const callProcess = async (action: "restart" | "stop" | "start") => {
    if (!canControl) {
      toast.error("Backend control access is disabled for this staff profile.");
      return;
    }
    if (!supervisorBase) {
      toast.error(
        "Supervisor is not available. Ensure the local app stack is running (npm run prod:start).",
      );
      return;
    }
    const paths = {
      restart: "/backend/restart",
      stop: "/backend/stop",
      start: "/backend/start",
    } as const;
    setBusy(action);
    try {
      const res = await fetch(`${supervisorBase}${paths[action]}`, {
        method: "POST",
        headers: supervisorHeaders(),
        credentials: authFetchCredentials(),
      });
      let data: { message?: string; error?: string } = {};
      try {
        data = (await res.json()) as { message?: string; error?: string };
      } catch {
        /* ignore */
      }
      if (res.ok) {
        toast.success(data.message || "Supervisor completed the request.");
        if (action === "stop" || action === "restart") setHealthOk(false);
        setTimeout(() => pingHealth(), action === "start" || action === "restart" ? 2200 : 500);
      } else {
        toast.error(data.message || data.error || `Request failed (${res.status})`);
      }
    } catch (e) {
      toast.error(
        `${e instanceof Error ? e.message : String(e)} (Is node scripts/apg-supervisor.mjs running?)`,
      );
    } finally {
      setBusy("");
    }
  };

  const invalidateStorage = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["storage"] }),
      qc.invalidateQueries({ queryKey: ["backups"] }),
    ]);
  };

  const restore = useMutation({
    mutationFn: () => systemApi.restoreBackup(selectedBackup),
    onSuccess: async () => {
      toast.success("Restore requested");
      await invalidateStorage();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteBackup = useMutation({
    mutationFn: () => systemApi.deleteBackup(selectedBackup),
    onSuccess: async () => {
      toast.success("Backup deleted");
      setSelectedBackup("");
      await invalidateStorage();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const prune = useMutation({
    mutationFn: () => systemApi.pruneBackups(Number(pruneDays) || 30),
    onSuccess: async () => {
      toast.success("Older backups pruned");
      await invalidateStorage();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const keepLatest = useMutation({
    mutationFn: () => systemApi.keepLatestBackups(Number(keepCount) || 10),
    onSuccess: async () => {
      toast.success("Kept latest backups only");
      await invalidateStorage();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canView) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Backend access is disabled for this staff profile.
      </div>
    );
  }

  const features = (healthMeta?.features || {}) as Record<string, unknown>;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Backend"
        description="Health checks, supervisor process control, and disk/backup diagnostics from production APIs."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="API"
          value={healthOk === null ? "…" : healthOk ? "Reachable" : "Down"}
          hint={String(healthMeta?.dataBackend || "")}
        />
        <StatCard
          label="Build"
          value={String(healthMeta?.version || "—")}
          hint={String(healthMeta?.buildSha || "").slice(0, 10)}
        />
        <StatCard
          label="Supervisor"
          value={
            !supervisorBase
              ? "N/A"
              : supervisorOk === null
                ? "…"
                : supervisorOk
                  ? "Reachable"
                  : "Down"
          }
          hint={supervisorBase || "Not configured"}
        />
      </div>

      <Card className="max-w-2xl border-slate-200 shadow-sm dark:border-border">
        <CardContent className="space-y-3 p-4">
          <div className="space-y-1 text-sm">
            <div>
              <span className="font-semibold">API: </span>
              {healthOk === null ? (
                <span className="text-muted-foreground">Checking…</span>
              ) : healthOk ? (
                <span className="text-emerald-700">Reachable</span>
              ) : (
                <span className="text-rose-700">Not reachable</span>
              )}
            </div>
            {supervisorBase ? (
              <div>
                <span className="font-semibold">Supervisor: </span>
                {supervisorOk === null ? (
                  <span className="text-muted-foreground">Checking…</span>
                ) : supervisorOk ? (
                  <span className="text-emerald-700">Reachable ({supervisorBase})</span>
                ) : (
                  <span className="text-rose-700">
                    Not running — use desktop app or run{" "}
                    <code className="rounded bg-slate-100 px-1 text-xs dark:bg-muted">
                      npm run dev:supervisor
                    </code>
                  </span>
                )}
              </div>
            ) : null}
            {lastCheck ? (
              <div className="text-xs text-muted-foreground">Last check: {lastCheck}</div>
            ) : null}
            {healthMeta && healthOk ? (
              <div className="mt-2 space-y-0.5 border-t border-slate-100 pt-2 text-xs text-slate-600 dark:border-border">
                <div>
                  Build: v{String(healthMeta.version || "?")}
                  {healthMeta.buildSha ? ` · ${String(healthMeta.buildSha)}` : ""}
                </div>
                <div>
                  Finance summary API:{" "}
                  {features.financeSummary ? (
                    <span className="font-medium text-emerald-700">enabled</span>
                  ) : (
                    <span className="font-medium text-rose-700">
                      missing — restart backend after git pull
                    </span>
                  )}
                </div>
              </div>
            ) : null}
            {financeCheck ? (
              <div
                className={`mt-2 rounded-lg border px-3 py-2 text-xs ${
                  financeCheck.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-900"
                }`}
              >
                {financeCheck.ok ? (
                  <>
                    <span className="font-semibold">Finance API OK</span> ({financeCheck.month}): ₹
                    {Number(financeCheck.collectedRevenue || 0).toLocaleString("en-IN")}
                    {financeCheck.revenueBasis ? ` · ${financeCheck.revenueBasis}` : ""}
                  </>
                ) : (
                  <>
                    <span className="font-semibold">Finance API failed</span> (
                    {financeCheck.status || "network"}): {financeCheck.message}
                  </>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => pingHealth()}>
              Check connection
            </Button>
            <Button
              variant="outline"
              className="border-indigo-200 bg-indigo-50 text-indigo-900 hover:bg-indigo-100"
              onClick={() => {
                void pingHealth();
                void verifyFinanceApi();
              }}
            >
              Verify finance API
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-border">
            <Button
              disabled={Boolean(busy) || !canControl}
              onClick={() => callProcess("restart")}
            >
              {busy === "restart" ? "Restarting…" : "Restart backend"}
            </Button>
            <Button
              variant="destructive"
              disabled={Boolean(busy) || !canControl}
              onClick={() => callProcess("stop")}
            >
              {busy === "stop" ? "Stopping…" : "Turn off backend"}
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={Boolean(busy) || !canControl}
              onClick={() => callProcess("start")}
            >
              {busy === "start" ? "Starting…" : "Turn on backend"}
            </Button>
          </div>

          {!canControl ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              You can view backend health, but process control actions are restricted for this staff
              profile.
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Supervisor runs locally on this machine. In production, public{" "}
            <code className="rounded bg-slate-100 px-1 dark:bg-muted">/api/process/*</code> endpoints
            are disabled; keep{" "}
            <code className="rounded bg-slate-100 px-1 dark:bg-muted">
              PROCESS_CONTROL_ENABLED=false
            </code>{" "}
            in <code className="rounded bg-slate-100 px-1 dark:bg-muted">.env.prod</code>.
          </p>
        </CardContent>
      </Card>

      {canDisk ? (
        <Card className="border-violet-200 shadow-sm dark:border-violet-900">
          <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 to-white px-4 py-3 dark:border-violet-900 dark:from-violet-950/30 dark:to-card">
            <h2 className="text-sm font-semibold">Disk Usage & Backups</h2>
            <p className="text-xs text-muted-foreground">
              Live storage metrics and SQLite backup controls from production APIs (owner).
            </p>
          </div>
          <CardContent className="space-y-4 p-4">
            {!isOwner ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Disk and backup APIs require master owner access.
              </div>
            ) : storageQuery.isLoading || backupsQuery.isLoading ? (
              <Skeleton className="h-32" />
            ) : storageQuery.isError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {(storageQuery.error as Error)?.message || "Could not load storage"}
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard label="SQLite DB" value={`${bytesToMb(storage.dbBytes)} MB`} />
                  <StatCard
                    label="Backups"
                    value={`${bytesToMb(storage.backupsBytes)} MB`}
                    hint={`${Number(storage.backupFileCount || backups.length)} files`}
                  />
                  <StatCard label="Total disk" value={`${bytesToMb(storage.totalBytes)} MB`} />
                  <StatCard label="Backup files" value={String(backups.length)} />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    className="min-w-[260px]"
                    value={selectedBackup}
                    onChange={(e) => setSelectedBackup(e.target.value)}
                  >
                    <option value="">Select backup…</option>
                    {pagedBackups.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    variant="outline"
                    className="border-amber-300 bg-amber-50 text-amber-800"
                    disabled={!selectedBackup || restore.isPending}
                    onClick={() => {
                      if (
                        confirm(
                          `Restore backup ${selectedBackup}? This may replace the live SQLite database.`,
                        )
                      ) {
                        restore.mutate();
                      }
                    }}
                  >
                    Restore
                  </Button>
                  <Button
                    variant="outline"
                    className="border-rose-300 bg-rose-50 text-rose-700"
                    disabled={!selectedBackup || deleteBackup.isPending}
                    onClick={() => {
                      if (confirm(`Delete backup ${selectedBackup}?`)) deleteBackup.mutate();
                    }}
                  >
                    Delete selected
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Select value={pruneDays} onChange={(e) => setPruneDays(e.target.value)}>
                    <option value="7">Prune older than 7 days</option>
                    <option value="15">Prune older than 15 days</option>
                    <option value="30">Prune older than 30 days</option>
                  </Select>
                  <Button
                    variant="outline"
                    disabled={prune.isPending}
                    onClick={() => prune.mutate()}
                  >
                    Prune older
                  </Button>
                  <Input
                    type="number"
                    className="h-9 w-24"
                    min={1}
                    value={keepCount}
                    onChange={(e) => setKeepCount(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    disabled={keepLatest.isPending}
                    onClick={() => keepLatest.mutate()}
                  >
                    Keep latest N
                  </Button>
                </div>

                {backups.length > backupPageSize ? (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Page {backupPage} of {backupPages}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={backupPage <= 1}
                        onClick={() => setBackupPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={backupPage >= backupPages}
                        onClick={() => setBackupPage((p) => Math.min(backupPages, p + 1))}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
