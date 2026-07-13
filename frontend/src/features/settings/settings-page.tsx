"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSettings } from "@/hooks/use-data";
import { settingsApi } from "@/services/api";

const CATEGORIES = [
  { key: "plans", label: "Plans" },
  { key: "statuses", label: "Statuses" },
  { key: "paymentMethods", label: "Payment methods" },
  { key: "expenseCategories", label: "Expense categories" },
  { key: "holdDurations", label: "Hold durations" },
  { key: "genders", label: "Genders" },
] as const;

export function SettingsPage() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useSettings();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const add = useMutation({
    mutationFn: ({ category, value }: { category: string; value: string }) => settingsApi.addLookup(category, value),
    onSuccess: async () => { toast.success("Added"); await qc.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: ({ category, value }: { category: string; value: string }) => settingsApi.deleteLookup(category, value),
    onSuccess: async () => { toast.success("Removed"); await qc.invalidateQueries({ queryKey: ["settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-96" />;
  return (
    <div>
      <PageHeader title="Settings" description="Plans, statuses, payment methods, and gym lookups." />
      <div className="grid gap-4 lg:grid-cols-2">
        {CATEGORIES.map((cat) => {
          const values = ((settings as any)?.[cat.key] || []) as string[];
          return (
            <Card key={cat.key}>
              <CardHeader><CardTitle>{cat.label}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input placeholder={`Add ${cat.label.toLowerCase()}`} value={drafts[cat.key] || ""} onChange={(e)=>setDrafts({...drafts, [cat.key]: e.target.value})} />
                  <Button onClick={() => {
                    const value = (drafts[cat.key] || "").trim();
                    if (!value) return;
                    add.mutate({ category: cat.key, value });
                    setDrafts({ ...drafts, [cat.key]: "" });
                  }}>Add</Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {values.map((v) => (
                    <button key={v} type="button" className="rounded-lg border px-2 py-1 text-xs hover:bg-rose-50 dark:hover:bg-rose-950/30" onClick={() => del.mutate({ category: cat.key, value: v })}>{v} ×</button>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
