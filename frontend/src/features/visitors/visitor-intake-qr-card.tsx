"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { qrImageUrl, visitorIntakeUrl } from "@/lib/qr";
import { useGymCodes } from "@/hooks/use-data";
import { useAuthStore } from "@/stores";

export function VisitorIntakeQrCard() {
  const user = useAuthStore((s) => s.user);
  const { data: gymCodes = [] } = useGymCodes();
  const branchId = String(user?.activeBranchId || user?.gymCodeId || "");
  const branch = gymCodes.find((g) => String(g.id) === branchId) || gymCodes[0];
  const code = String(branch?.code || "").trim();
  const url = useMemo(() => (code ? visitorIntakeUrl(code) : ""), [code]);
  const [copied, setCopied] = useState(false);

  if (!code || !url) return null;

  return (
    <Card className="border-teal-200/60 bg-teal-50/40 dark:border-teal-500/25 dark:bg-teal-950/30">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <img
          src={qrImageUrl(url, 160)}
          alt="Visitor intake QR"
          className="mx-auto h-40 w-40 rounded-xl border border-white bg-white p-2 shadow-sm sm:mx-0"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-300">
              Visitor QR
            </p>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              Public intake · {branch?.name || code}
            </h3>
            <p className="text-xs text-muted-foreground">
              Guests scan this to join the Visitor list. Staff can convert them to Members later.
            </p>
          </div>
          <p className="truncate rounded-lg border border-border/70 bg-background/80 px-2 py-1.5 font-mono text-[11px]">
            {url}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  toast.success("Visitor link copied");
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  toast.error("Could not copy link");
                }
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.open(url, "_blank")}>
              Open form
            </Button>
            <a
              href={qrImageUrl(url, 512)}
              download={`visitor-qr-${code}.png`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent"
            >
              Download QR
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
