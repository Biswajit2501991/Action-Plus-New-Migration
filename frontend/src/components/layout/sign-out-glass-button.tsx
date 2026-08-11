"use client";

import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Visual-only Sign out control. Callers pass the existing logout handler.
 */
export function SignOutGlassButton({
  onClick,
  collapsed = false,
  className,
}: {
  onClick: () => void;
  collapsed?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Sign out"
      className={cn("signout-glass-tile", collapsed && "signout-glass-tile--compact", className)}
    >
      <LogOut className="h-4 w-4 shrink-0" aria-hidden />
      {!collapsed ? <span>Sign out</span> : null}
    </button>
  );
}
