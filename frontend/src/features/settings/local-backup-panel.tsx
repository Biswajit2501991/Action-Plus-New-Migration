"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  financeApi,
  logsApi,
  membersApi,
  settingsApi,
  usersApi,
  visitorsApi,
} from "@/services/api";
import { downloadTextFile } from "@/lib/utils";
import { localTodayCalendarKey } from "@/lib/domain/billing";
import { captureHistoryFromCache } from "@/stores/history-store";

type BackupPayload = {
  version: string;
  exportedAt: string;
  members: unknown[];
  visitors: unknown[];
  users: unknown[];
  settings: Record<string, unknown>;
  logs: unknown[];
  financeTransactions: unknown[];
  filters?: unknown;
};

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export function LocalBackupPanel() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const exportBackup = async () => {
    setBusy(true);
    try {
      const [members, visitors, users, settings, logs, finance] = await Promise.all([
        membersApi.list(),
        visitorsApi.list().catch(() => []),
        usersApi.list(),
        settingsApi.get("full"),
        logsApi.listAll({ limit: 2000 }).catch(() => []),
        financeApi.list().catch(() => []),
      ]);
      const payload: BackupPayload = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        members: members || [],
        visitors: visitors || [],
        users: users || [],
        settings: (settings || {}) as Record<string, unknown>,
        logs: logs || [],
        financeTransactions: finance || [],
      };
      downloadTextFile(
        `action-plus-backup-${localTodayCalendarKey()}.json`,
        JSON.stringify(payload, null, 2),
        "application/json",
      );
      try {
        await logsApi.create({
          action: "backup.exported",
          entityType: "backup",
          entityId: "local",
        });
      } catch {
        /* ignore */
      }
      toast.success("Backup exported");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  const importBackup = async (file: File) => {
    if (file.size > MAX_IMPORT_BYTES) {
      toast.error("Backup file must be 5MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      const raw = JSON.parse(text) as BackupPayload;
      if (
        !Array.isArray(raw.members) ||
        !Array.isArray(raw.users) ||
        !Array.isArray(raw.logs) ||
        !raw.settings ||
        typeof raw.settings !== "object"
      ) {
        throw new Error("Invalid backup file shape.");
      }
      captureHistoryFromCache(qc, "Before local backup import");
      await membersApi.bulk(raw.members as never);
      if (Array.isArray(raw.visitors)) await visitorsApi.bulk(raw.visitors as never);
      await usersApi.bulk(raw.users as never);
      await settingsApi.bulk(raw.settings as never);
      if (Array.isArray(raw.financeTransactions)) {
        await financeApi.bulk(raw.financeTransactions as never);
      }
      if (Array.isArray(raw.logs) && raw.logs.length) {
        await logsApi.bulk(raw.logs as never).catch(() => null);
      }
      try {
        await logsApi.create({
          action: "backup.imported",
          entityType: "backup",
          entityId: "local",
        });
      } catch {
        /* ignore */
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["members"] }),
        qc.invalidateQueries({ queryKey: ["visitors"] }),
        qc.invalidateQueries({ queryKey: ["users"] }),
        qc.invalidateQueries({ queryKey: ["settings"] }),
        qc.invalidateQueries({ queryKey: ["finance"] }),
        qc.invalidateQueries({ queryKey: ["logs"] }),
      ]);
      toast.success("Backup imported — data restored.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50/60 to-white p-4 dark:border-border dark:from-slate-950/40 dark:to-card">
      <div>
        <h3 className="text-sm font-semibold">Local backup</h3>
        <p className="text-xs text-muted-foreground">
          Export / import members, visitors, staff, settings, finance, and logs as JSON (max 5MB).
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void exportBackup()}>
          Export Data
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          Import Data
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importBackup(file);
          }}
        />
      </div>
    </div>
  );
}
