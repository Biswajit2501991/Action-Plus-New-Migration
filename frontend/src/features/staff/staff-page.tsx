"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader, Badge, Skeleton, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { useUsers } from "@/hooks/use-data";
import { usersApi } from "@/services/api";
import type { StaffUser } from "@/types";

export function StaffPage() {
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useUsers();
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [form, setForm] = useState({ name: "", email: "", role: "" });

  const save = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const next = users.map((u) => u.id === editing.id ? { ...u, ...form } : u);
      return usersApi.bulk(next);
    },
    onSuccess: async () => { toast.success("Staff updated"); setEditing(null); await qc.invalidateQueries({ queryKey: ["users"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <div>
      <PageHeader title="Staff" description="Roles, access sections, and staff accounts." />
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-4 py-3">Staff</th><th>Role</th><th>Sections</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border/60">
                  <td className="px-4 py-3"><div className="font-medium">{u.name || u.id}</div><div className="text-xs text-muted-foreground">{u.email || u.id}</div></td>
                  <td>{u.role || u.staffRole || "—"}</td>
                  <td className="max-w-xs truncate text-xs">{(u.sections || []).join(", ") || "—"}</td>
                  <td><Badge variant={u.blocked ? "danger" : "success"}>{u.blocked ? "Blocked" : "Active"}</Badge></td>
                  <td className="px-4 py-3"><Button size="sm" variant="outline" onClick={() => { setEditing(u); setForm({ name: u.name || "", email: u.email || "", role: u.role || "" }); }}>Edit</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!users.length ? <div className="p-6"><EmptyState title="No staff found" /></div> : null}
        </CardContent>
      </Card>
      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-background p-6">
            <h2 className="text-lg font-semibold">Edit staff</h2>
            <div className="mt-4 space-y-3">
              <div><Label>Name</Label><Input className="mt-1" value={form.name} onChange={(e)=>setForm({...form, name:e.target.value})} /></div>
              <div><Label>Email</Label><Input className="mt-1" value={form.email} onChange={(e)=>setForm({...form, email:e.target.value})} /></div>
              <div><Label>Role</Label><Input className="mt-1" value={form.role} onChange={(e)=>setForm({...form, role:e.target.value})} /></div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={()=>setEditing(null)}>Cancel</Button>
              <Button onClick={()=>save.mutate()}>Save</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
