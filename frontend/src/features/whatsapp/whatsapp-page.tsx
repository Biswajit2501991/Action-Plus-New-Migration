"use client";
import { PageHeader, Skeleton } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMembers, useWhatsapp } from "@/hooks/use-data";
import { formatDate } from "@/lib/utils";

function waLink(mobile?: string, text?: string) {
  const phone = String(mobile || "").replace(/\D/g, "");
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${phone}${q}`;
}

export function WhatsappPage() {
  const { data, isLoading } = useWhatsapp();
  const { data: members = [] } = useMembers();
  if (isLoading) return <Skeleton className="h-96" />;
  const templates = Object.entries(data?.templates || {});
  const events = (Array.isArray(data?.events) ? data.events : []) as Record<string, unknown>[];
  return (
    <div>
      <PageHeader title="WhatsApp / SMS" description="Templates, reminders, and message activity." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Templates</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {templates.map(([key, value]) => (
              <div key={key} className="rounded-xl border px-3 py-2 text-sm">
                <p className="font-medium">{key}</p>
                <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                  {typeof value === "string" ? value : JSON.stringify(value)}
                </p>
              </div>
            ))}
            {!templates.length ? <p className="text-sm text-muted-foreground">No templates loaded.</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Quick send</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {members.slice(0, 12).map((m) => (
              <div key={m.memberId} className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm">
                <span>{m.name || m.memberId}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    window.open(
                      waLink(m.mobile, `Hi ${m.name || ""}, reminder from Action Plus Gym.`),
                      "_blank",
                    )
                  }
                >
                  WhatsApp
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader><CardTitle>SMS events</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {events.slice(0, 30).map((e, i) => (
            <div key={i} className="rounded-xl border px-3 py-2 text-xs text-muted-foreground">
              {formatDate(String(e.createdAt || e.at || ""))} · {String(e.type || e.template || "event")} ·{" "}
              {String(e.memberId || e.to || "—")}
            </div>
          ))}
          {!events.length ? <p className="text-sm text-muted-foreground">No SMS events yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
