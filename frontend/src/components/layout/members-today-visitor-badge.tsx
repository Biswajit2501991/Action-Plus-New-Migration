"use client";

import { useEffect, useMemo, useState } from "react";
import { useVisitors } from "@/hooks/use-data";
import { hasAccess } from "@/lib/domain/permissions";
import {
  calendarDateKeyInTimeZone,
  countVisitorsCreatedToday,
  formatTodayVisitorsNavSuffix,
} from "@/lib/domain/today-visitors-nav";
import { useAuthStore } from "@/stores";
import { cn } from "@/lib/utils";

/** Recompute when the IST calendar day rolls over. */
function useIstDayKey() {
  const [dayKey, setDayKey] = useState(() =>
    calendarDateKeyInTimeZone(new Date(), "Asia/Kolkata"),
  );
  useEffect(() => {
    const tick = () => {
      const next = calendarDateKeyInTimeZone(new Date(), "Asia/Kolkata");
      setDayKey((prev) => (prev === next ? prev : next));
    };
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return dayKey;
}

/**
 * Same-day visitor count beside Members — e.g. "(2V)".
 * Auto-hides when the India calendar day changes (count becomes 0).
 */
export function MembersTodayVisitorBadge({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const user = useAuthStore((s) => s.user);
  const { data: visitors = [] } = useVisitors();
  const dayKey = useIstDayKey();

  const canSee =
    Boolean(user) &&
    (hasAccess(user, "members", "viewVisitors") ||
      hasAccess(user, "members", "viewMembers"));

  const suffix = useMemo(() => {
    if (!canSee) return "";
    const count = countVisitorsCreatedToday(visitors);
    return formatTodayVisitorsNavSuffix(count);
  }, [canSee, visitors, dayKey]);

  if (!suffix) return null;

  return (
    <span
      className={cn(
        "shrink-0 font-semibold tabular-nums tracking-tight text-sky-700 dark:text-sky-300",
        compact ? "text-[9px]" : "text-[11px]",
        className,
      )}
      title="New visitors added today (website, QR, or manual)"
      aria-label={`${suffix.replace(/[()]/g, "")} visitors added today`}
    >
      {suffix}
    </span>
  );
}
