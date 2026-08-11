"use client";

import Link from "next/link";
import { MobileHero, MobilePanel } from "@/components/layout/mobile-ui";
import { SignOutGlassButton } from "@/components/layout/sign-out-glass-button";
import { NAV_GROUP_ORDER, NAV_ITEMS } from "@/lib/nav";
import {
  canAccessNavItem,
  hasAccess,
  mobileAccessKeyForPath,
} from "@/lib/domain/permissions";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { PageHeader } from "@/components/ui/misc";
import { useAuthStore } from "@/stores";
import { cn } from "@/lib/utils";

const GROUP_THEME: Record<
  string,
  { ring: string; panel: string; icon: string; label: string }
> = {
  "MEMBERS & CLIENTS": {
    ring: "border-cyan-500/40 dark:border-cyan-300/35",
    panel:
      "bg-[linear-gradient(160deg,rgba(7,32,58,0.86),rgba(7,18,38,0.8))] dark:bg-[linear-gradient(160deg,rgba(3,33,53,0.64),rgba(3,18,31,0.72))]",
    icon: "text-cyan-300 dark:text-cyan-200",
    label: "text-cyan-200/95 dark:text-cyan-100/95",
  },
  COMMUNICATION: {
    ring: "border-violet-500/40 dark:border-violet-300/35",
    panel:
      "bg-[linear-gradient(160deg,rgba(42,19,67,0.84),rgba(26,13,45,0.8))] dark:bg-[linear-gradient(160deg,rgba(54,23,86,0.66),rgba(33,16,55,0.74))]",
    icon: "text-violet-300 dark:text-violet-200",
    label: "text-violet-200/95 dark:text-violet-100/95",
  },
  OPERATIONS: {
    ring: "border-teal-500/40 dark:border-teal-300/35",
    panel:
      "bg-[linear-gradient(160deg,rgba(8,51,53,0.84),rgba(6,31,41,0.8))] dark:bg-[linear-gradient(160deg,rgba(8,62,62,0.66),rgba(5,34,40,0.74))]",
    icon: "text-teal-300 dark:text-teal-200",
    label: "text-teal-200/95 dark:text-teal-100/95",
  },
  FINANCE: {
    ring: "border-amber-500/40 dark:border-amber-300/35",
    panel:
      "bg-[linear-gradient(160deg,rgba(64,44,8,0.84),rgba(40,27,9,0.8))] dark:bg-[linear-gradient(160deg,rgba(77,54,10,0.66),rgba(47,32,8,0.74))]",
    icon: "text-amber-300 dark:text-amber-200",
    label: "text-amber-200/95 dark:text-amber-100/95",
  },
  "STAFF & MANAGEMENT": {
    ring: "border-fuchsia-500/40 dark:border-fuchsia-300/35",
    panel:
      "bg-[linear-gradient(160deg,rgba(63,18,54,0.84),rgba(39,11,35,0.8))] dark:bg-[linear-gradient(160deg,rgba(79,20,70,0.66),rgba(46,14,41,0.74))]",
    icon: "text-fuchsia-300 dark:text-fuchsia-200",
    label: "text-fuchsia-200/95 dark:text-fuchsia-100/95",
  },
  SYSTEM: {
    ring: "border-slate-500/40 dark:border-slate-300/35",
    panel:
      "bg-[linear-gradient(160deg,rgba(28,41,63,0.86),rgba(16,27,46,0.82))] dark:bg-[linear-gradient(160deg,rgba(33,49,72,0.68),rgba(19,30,50,0.76))]",
    icon: "text-slate-300 dark:text-slate-200",
    label: "text-slate-200/95 dark:text-slate-100/95",
  },
  "": {
    ring: "border-blue-500/40 dark:border-blue-300/35",
    panel:
      "bg-[linear-gradient(160deg,rgba(18,45,86,0.86),rgba(10,27,57,0.82))] dark:bg-[linear-gradient(160deg,rgba(22,57,106,0.68),rgba(12,33,66,0.76))]",
    icon: "text-blue-300 dark:text-blue-200",
    label: "text-blue-200/95 dark:text-blue-100/95",
  },
};

export default function MorePage() {
  const { logout } = useAuth();
  const user = useAuthStore((s) => s.user);
  const isMobile = useIsMobile();

  if (isMobile) {
    const items = NAV_ITEMS.filter((item) => {
      if (!canAccessNavItem(user, item)) return false;
      const key = mobileAccessKeyForPath(item.href);
      if (!key) return hasAccess(user, "mobile", "viewMore");
      if (key === "viewMore") return false;
      if (key.startsWith("more")) {
        return hasAccess(user, "mobile", "viewMore") && hasAccess(user, "mobile", key);
      }
      return hasAccess(user, "mobile", key);
    });
    const groups = NAV_GROUP_ORDER.filter((g) => items.some((i) => i.group === g));

    return (
      <div className="space-y-4">
        <MobileHero
          eyebrow="Modules"
          title="More"
          subtitle="Finance, WhatsApp, settings, and the rest of the desk."
        />
        <div className="space-y-3">
          {groups.map((group) => {
            const cfg = GROUP_THEME[group] || GROUP_THEME.SYSTEM;
            const groupItems = items.filter((i) => i.group === group);
            if (!groupItems.length) return null;
            if (!group) {
              const item = groupItems[0];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-[0_8px_22px_-12px_rgba(15,23,42,0.45)] backdrop-blur-xl transition active:scale-[0.99]",
                    cfg.ring,
                    cfg.panel,
                  )}
                >
                  <item.icon className={cn("h-5 w-5", cfg.icon)} />
                  <span className="text-base font-semibold text-white dark:text-slate-50">
                    {item.label}
                  </span>
                </Link>
              );
            }
            return (
              <section
                key={group}
                className={cn(
                  "rounded-2xl border px-3.5 py-3 shadow-[0_14px_28px_-16px_rgba(15,23,42,0.55)] backdrop-blur-xl",
                  cfg.ring,
                  cfg.panel,
                )}
              >
                <p className={cn("mb-1.5 text-[11px] font-semibold uppercase tracking-wider", cfg.label)}>
                  {group}
                </p>
                <div className="space-y-1">
                  {groupItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-[1rem] text-white/95 transition hover:bg-white/10 active:scale-[0.99] dark:text-slate-50"
                    >
                      <item.icon className={cn("h-4 w-4 shrink-0", cfg.icon)} />
                      <span className="truncate font-medium">{item.label}</span>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
        <MobilePanel className="p-2">
          <SignOutGlassButton
            className="justify-center py-3.5 text-sm"
            onClick={() => void logout()}
          />
        </MobilePanel>
      </div>
    );
  }

  const items = NAV_ITEMS.filter((item) => canAccessNavItem(user, item));
  const groups = NAV_GROUP_ORDER.filter((g) => items.some((i) => i.group === g));
  return (
    <div>
      <PageHeader title="More" description="All modules" />
      <div className="space-y-3">
        {groups.map((group) => {
          const cfg = GROUP_THEME[group] || GROUP_THEME.SYSTEM;
          const groupItems = items.filter((i) => i.group === group);
          return (
            <section
              key={group || "main"}
              className={cn("rounded-2xl border p-4 shadow-sm backdrop-blur-xl", cfg.ring, cfg.panel)}
            >
              {group ? (
                <p className={cn("mb-2 text-xs font-semibold uppercase tracking-wider", cfg.label)}>
                  {group}
                </p>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                {groupItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-xl border border-white/15 bg-white/10 p-3 text-sm font-medium text-white transition hover:bg-white/15 dark:text-slate-50"
                  >
                    <item.icon className={cn("mb-2 h-4 w-4", cfg.icon)} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
