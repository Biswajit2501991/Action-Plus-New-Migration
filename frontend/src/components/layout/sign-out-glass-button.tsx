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
      <span className="signout-glass-tile__mark" aria-hidden>
        <LogOut className="signout-glass-tile__icon" strokeWidth={1.9} />
      </span>
      {!collapsed ? <span className="signout-glass-tile__label">Sign out</span> : null}
    </button>
  );
}
