"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { canAccessSection } from "@/lib/domain/permissions";
import { useAuthStore } from "@/stores";
import { README_TOPICS } from "@/features/readme/readme-guide";

export function ReadMePage() {
  const user = useAuthStore((s) => s.user);
  const allowed = canAccessSection(user, "Read Me");
  const topics = README_TOPICS.filter(
    (topic) => !topic.gate || canAccessSection(user, topic.gate),
  );

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Read Me" description="You do not have access to this page." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Read Me"
        description="What Gym Manager can do, and how each part works. This page only explains. It does not change records."
      />
      <div className="grid gap-4">
        {topics.map((topic) => (
          <Card key={topic.id}>
            <CardHeader>
              <CardTitle>{topic.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">{topic.summary}</p>
              <ul className="list-disc space-y-1.5 pl-5 text-foreground">
                {topic.how.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
