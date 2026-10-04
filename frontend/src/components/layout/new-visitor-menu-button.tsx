"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useVisitors } from "@/hooks/use-data";
import { hasAccess } from "@/lib/domain/permissions";
import { visitorsForNewButton } from "@/lib/domain/new-visitors";
import { useAuthStore } from "@/stores";

/** Flashing Members-menu pill. Reads visitors only. */
export function NewVisitorMenuButton({
  className = "",
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const { data: visitors = [] } = useVisitors();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const show = useMemo(
    () =>
      hasAccess(user, "members", "viewVisitors") &&
      visitorsForNewButton(visitors, nowMs).length > 0,
    [user, visitors, nowMs],
  );

  if (!show) return null;

  return (
    <Link
      href="/members?tab=visitors"
      onClick={onNavigate}
      className={`apg-new-visitor-flash inline-flex h-4 shrink-0 items-center px-1.5 text-[8px] font-semibold leading-none tracking-tight ${className}`}
    >
      New Visitor
    </Link>
  );
}
