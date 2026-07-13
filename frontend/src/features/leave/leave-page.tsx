"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader, Badge, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useSettings } from "@/hooks/use-data";
import { leaveApi } from "@/services/api";
import { formatDate } from "@/lib/utils";
import { useAuthStore } from "@/stores";
import type { LeaveRequest } from "@/types";

export function LeavePage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { data: settings, isLoading } = useSettings();
  const requests = (settings?.leaveRequests || []) as LeaveRequest[];
  const [form, setForm] = useState({ fromDate: "", toDate: "", reason: "" });
  const create = useMutation({
    mutationFn: () => leaveApi.create({ ...form, staffId: user?.id, status: "pending" }),
    onSuccess: async () => { toast.success("Leave requested"); setForm({ fromDate: "", toDate: "", reason: "" }); await qc.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => leaveApi.update(id, { status }),
    onSuccess: async () => { toast.success("Updated"); await qc.invalidateQueries({ queryKey: ["settings"] }); },
  });
  if (isLoading) return <Skeleton className="h-96" />;
  return (
    <div>
      <PageHeader title="Leave Tracker" description="Create and review staff leave requests." />
      <Card className="mb-6">
        <CardContent className="grid gap-3 p-5 md:grid-cols-4">
          <div><Label>From</Label><Input className="mt-1" type="date" value={form.fromDate} onChange={(e)=>setForm({...form, fromDate:e.target.value})} /></div>
          <div><Label>To</Label><Input className="mt-1" type="date" value={form.toDate} onChange={(e)=>setForm({...form, toDate:e.target.value})} /></div>
          <div className="md:col-span-2"><Label>Reason</Label><Textarea className="mt-1" value={form.reason} onChange={(e)=>setForm({...form, reason:e.target.value})} /></div>
          <Button onClick={()=>create.mutate()} disabled={create.isPending}>Submit request</Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-3 p-5">
          {requests.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{r.staffId} · {formatDate(r.fromDate)} → {formatDate(r.toDate)}</p>
                <p className="text-xs text-muted-foreground">{r.reason}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "warning"}>{r.status}</Badge>
                {r.status === "pending" ? (
                  <>
                    <Button size="sm" variant="outline" onClick={()=>update.mutate({ id: r.id, status: "approved" })}>Approve</Button>
                    <Button size="sm" variant="ghost" onClick={()=>update.mutate({ id: r.id, status: "rejected" })}>Reject</Button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
          {!requests.length ? <p className="text-sm text-muted-foreground">No leave requests yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
