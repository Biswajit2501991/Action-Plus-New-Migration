"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader, Badge, Skeleton, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAttendance, useUsers } from "@/hooks/use-data";
import { attendanceApi } from "@/services/api";
import { formatDate } from "@/lib/utils";
import { hasAccess } from "@/lib/domain/permissions";
import { useAuthStore } from "@/stores";

export function AttendancePage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { data: records = [], isLoading } = useAttendance();
  const { data: users = [] } = useUsers();
  const punch = useMutation({
    mutationFn: () => attendanceApi.punch({ staffId: user?.id, status: "Present", date: new Date().toISOString().slice(0,10) }),
    onSuccess: async () => { toast.success("Punched in"); await qc.invalidateQueries({ queryKey: ["attendance"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const markAll = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().slice(0,10);
      const next = users.map((u) => ({ staffId: u.id, date: today, status: "Present" }));
      return attendanceApi.saveRecords([...(records || []), ...next]);
    },
    onSuccess: async () => { toast.success("Marked all present"); await qc.invalidateQueries({ queryKey: ["attendance"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-96" />;
  return (
    <div>
      <PageHeader title="Attendance" description="Staff attendance punches and daily records." actions={
        <>
          <Button variant="outline" onClick={()=>punch.mutate()}>Punch today</Button>
          {hasAccess(user, "attendance", "markAllPresent") ? <Button onClick={()=>markAll.mutate()}>Mark all present</Button> : null}
        </>
      } />
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-4 py-3">Staff</th><th>Date</th><th>Status</th><th>Notes</th></tr></thead>
            <tbody>
              {(records || []).map((r, i) => (
                <tr key={String(r.id || i)} className="border-b border-border/60">
                  <td className="px-4 py-3">{r.staffId}</td>
                  <td>{formatDate(r.date)}</td>
                  <td><Badge variant={r.status === "Present" ? "success" : "warning"}>{r.status || "—"}</Badge></td>
                  <td>{r.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!records?.length ? <div className="p-6"><EmptyState title="No attendance records" description="Punch in or mark staff present to get started." /></div> : null}
        </CardContent>
      </Card>
    </div>
  );
}
