"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/services/api/client";
import { canAccessSection, hasAccess } from "@/lib/domain/permissions";
import { useAuthStore } from "@/stores";
import { cn } from "@/lib/utils";

/**
 * Red/teal unread pill beside Portal Chat when members have open (awaiting reply) threads.
 */
export function PortalChatUnreadBadge({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const user = useAuthStore((s) => s.user);
  const canSee =
    Boolean(user) &&
    (canAccessSection(user, "WhatsApp Verification") ||
      canAccessSection(user, "Members") ||
      hasAccess(user, "members", "editMembers"));
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!canSee) return;
    let cancelled = false;
    const pull = async () => {
      try {
        const data = await apiFetch<{ ok?: boolean; count?: number }>(
          "/portal-chat/unread-count",
        );
        if (!cancelled) setCount(Number(data.count) || 0);
      } catch {
        if (!cancelled) setCount(0);
      }
    };
    void pull();
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void pull();
    }, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [canSee]);

  if (!canSee || count < 1) return null;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md bg-teal-600 font-bold tabular-nums text-white dark:bg-teal-400 dark:text-slate-950",
        compact ? "h-4 min-w-4 px-1 text-[9px]" : "h-5 min-w-5 px-1.5 text-[10px]",
        className,
      )}
      title={`${count} member chat${count === 1 ? "" : "s"} awaiting reply`}
      aria-label={`${count} unread member chats`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
