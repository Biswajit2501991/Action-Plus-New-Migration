"use client";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export function HelpPage() {
  return (
    <div>
      <PageHeader title="Help" description="Shortcuts and guidance for Action Plus Gym Manager V2." />
      <div className="grid gap-4 md:grid-cols-2">
        <Card><CardHeader><CardTitle>Keyboard shortcuts</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><p><kbd className="rounded border px-1.5">⌘</kbd> + <kbd className="rounded border px-1.5">K</kbd> Open command palette / global search</p><p>Use the sidebar favorites (pin icon) for pinned pages.</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Compatibility</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">This frontend uses the existing Action Plus Express APIs without schema changes. Inventory and advanced marketing remain disabled until backend endpoints exist.</CardContent></Card>
      </div>
    </div>
  );
}
