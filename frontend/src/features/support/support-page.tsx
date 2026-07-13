"use client";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWhatsapp } from "@/hooks/use-data";

export function SupportPage() {
  const { data } = useWhatsapp();
  const custom = (Array.isArray(data?.custom) ? data.custom : []) as Record<string, unknown>[];
  return (
    <div>
      <PageHeader title="Support" description="Support templates and help text used across the gym." />
      <Card>
        <CardHeader><CardTitle>Custom templates</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {custom.map((t, i) => (
            <div key={String(t.id ?? i)} className="rounded-xl border px-3 py-2 text-sm">
              <p className="font-medium">{String(t.title || t.name || t.key || `Template ${i + 1}`)}</p>
              <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                {String(t.body || t.content || JSON.stringify(t))}
              </p>
            </div>
          ))}
          {!custom.length ? (
            <p className="text-sm text-muted-foreground">
              No custom support templates found. Create them via the existing Settings/Support APIs.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
