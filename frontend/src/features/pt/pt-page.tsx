"use client";
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader, Skeleton, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea, Label, Input } from "@/components/ui/input";
import { useMembers, useSettings } from "@/hooks/use-data";
import { ptApi } from "@/services/api";

export function PtPage() {
  const qc = useQueryClient();
  const { data: members = [], isLoading } = useMembers();
  const { data: settings } = useSettings();
  const profiles = (settings?.ptClientProfiles || {}) as Record<string, any>;
  const clients = useMemo(() => {
    const ids = Object.keys(profiles);
    if (ids.length) return members.filter((m) => ids.includes(m.memberId) || Boolean(m.trainerId));
    return members.filter((m) => Boolean(m.trainerId) || String(m.plan || "").toLowerCase().includes("pt"));
  }, [members, profiles]);
  const [selected, setSelected] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [plan, setPlan] = useState("");

  const save = useMutation({
    mutationFn: () => ptApi.patchProfile(selected!, { notes, plan, updatedAt: new Date().toISOString() }),
    onSuccess: async () => { toast.success("PT profile saved"); await qc.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-96" />;
  return (
    <div>
      <PageHeader title="Personal Training" description="Trainer assignments, plans, and PT client notes." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-2 p-5">
            {clients.map((m) => (
              <button key={m.memberId} type="button" className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm hover:bg-accent" onClick={() => { setSelected(m.memberId); setNotes(String(profiles[m.memberId]?.notes || "")); setPlan(String(profiles[m.memberId]?.plan || m.plan || "")); }}>
                <span className="font-medium">{m.name || m.memberId}</span>
                <span className="text-xs text-muted-foreground">{m.trainerId || "Unassigned"}</span>
              </button>
            ))}
            {!clients.length ? <EmptyState title="No PT clients" description="Assign trainers or create PT profiles in settings." /> : null}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 p-5">
            {selected ? (
              <>
                <p className="text-sm font-semibold">Editing {selected}</p>
                <div><Label>PT Plan</Label><Input className="mt-1" value={plan} onChange={(e)=>setPlan(e.target.value)} /></div>
                <div><Label>Notes / workout</Label><Textarea className="mt-1" value={notes} onChange={(e)=>setNotes(e.target.value)} /></div>
                <Button onClick={()=>save.mutate()} disabled={save.isPending}>Save profile</Button>
              </>
            ) : <p className="text-sm text-muted-foreground">Select a PT client to edit.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
