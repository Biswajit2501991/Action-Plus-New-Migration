"use client";
import { useMemo } from "react";
import { PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMembers } from "@/hooks/use-data";
import { birthdaysThisMonth, countByStatus, expiringSoon } from "@/lib/domain/members";
import { downloadTextFile, formatDate, toCsv } from "@/lib/utils";

export function ReportsPage() {
  const { data: members = [] } = useMembers();
  const status = useMemo(() => countByStatus(members), [members]);
  const expiring = useMemo(() => expiringSoon(members, 30), [members]);
  const birthdays = useMemo(() => birthdaysThisMonth(members), [members]);
  const inactive = useMemo(() => members.filter((m) => ["Deactivated", "Cancelled"].includes(String(m.status || ""))), [members]);
  const outstanding = useMemo(() => members.filter((m) => {
    const last = (m.paymentHistory || []).slice().sort((a,b)=> new Date(String(b.paidAt||b.paid_at||0)).getTime() - new Date(String(a.paidAt||a.paid_at||0)).getTime())[0];
    if (!last) return true;
    const days = (Date.now() - new Date(String(last.paidAt || last.paid_at)).getTime()) / 86400000;
    return days > 35;
  }), [members]);

  return (
    <div>
      <PageHeader title="Reports" description="Derived reports from live member and payment data." actions={
        <Button variant="outline" onClick={() => downloadTextFile("members-report.csv", toCsv(members as any))}>Export members</Button>
      } />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[
          ["By status", Object.entries(status).map(([k,v]) => `${k}: ${v}`).join(" · ")],
          ["Expiring (30d)", `${expiring.length} members`],
          ["Birthdays", `${birthdays.length} this month`],
          ["Inactive", `${inactive.length} deactivated/cancelled`],
          ["Outstanding", `${outstanding.length} without recent payment`],
        ].map(([title, body]) => (
          <Card key={title as string}><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{body}</CardContent></Card>
        ))}
      </div>
      <Card className="mt-6">
        <CardHeader><CardTitle>Expiring memberships</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {expiring.slice(0, 40).map((m) => (
            <div key={m.memberId} className="flex justify-between text-sm"><span>{m.name || m.memberId}</span><span className="text-muted-foreground">{formatDate(m.renewalDate)}</span></div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
