"use client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader, StatCard } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { systemApi } from "@/services/api";
import { hasAccess } from "@/lib/domain/permissions";
import { useAuthStore } from "@/stores";

export function BackendPage() {
  const user = useAuthStore((s) => s.user);
  const health = useQuery({ queryKey: ["health"], queryFn: systemApi.health });
  const version = useQuery({ queryKey: ["version"], queryFn: systemApi.version });
  const storage = useQuery({ queryKey: ["storage"], queryFn: systemApi.storage, retry: false });

  const run = async (fn: () => Promise<unknown>, label: string) => {
    try { await fn(); toast.success(label); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  return (
    <div>
      <PageHeader title="Backend" description="Health, storage, and process controls for operators." />
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Health" value={health.data ? "Connected" : health.isError ? "Down" : "…"} hint={String((health.data as any)?.dataBackend || "")} />
        <StatCard label="Version" value={String((version.data as any)?.version || "—")} hint={String((version.data as any)?.buildSha || "").slice(0, 8)} />
        <StatCard label="Storage" value={storage.data ? "OK" : "—"} hint="Disk / backup status" />
      </div>
      {hasAccess(user, "backend", "controlBackendProcesses") ? (
        <Card className="mt-6">
          <CardHeader><CardTitle>Process controls</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => run(systemApi.processStart, "Start requested")}>Start</Button>
            <Button variant="outline" onClick={() => run(systemApi.processRestart, "Restart requested")}>Restart</Button>
            <Button variant="destructive" onClick={() => run(systemApi.processStop, "Stop requested")}>Stop</Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
