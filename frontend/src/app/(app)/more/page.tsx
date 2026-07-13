"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { MobileHero, MobilePanel } from "@/components/layout/mobile-ui";
import { NAV_ITEMS } from "@/lib/nav";
import {
  canAccessSection,
  hasAccess,
  mobileAccessKeyForPath,
} from "@/lib/domain/permissions";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { PageHeader } from "@/components/ui/misc";
import { useAuthStore } from "@/stores";
import { cn } from "@/lib/utils";

export default function MorePage() {
  const { logout } = useAuth();
  const user = useAuthStore((s) => s.user);
  const isMobile = useIsMobile();

  if (isMobile) {
    const items = NAV_ITEMS.filter((item) => {
      const key = mobileAccessKeyForPath(item.href);
      if (!key) return hasAccess(user, "mobile", "viewMore");
      if (key === "viewMore") return false;
      if (key.startsWith("more")) {
        return hasAccess(user, "mobile", "viewMore") && hasAccess(user, "mobile", key);
      }
      return hasAccess(user, "mobile", key);
    });

    return (
      <div className="space-y-4">
        <MobileHero
          eyebrow="Modules"
          title="More"
          subtitle="Finance, WhatsApp, settings, and the rest of the desk."
        />
        <div className="grid grid-cols-2 gap-2.5">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-[1.25rem] border border-black/5 bg-white/85 p-4 shadow-sm transition active:scale-[0.99] dark:border-white/8 dark:bg-white/[0.04]"
            >
              <item.icon className="mb-2.5 h-5 w-5 text-teal-700 dark:text-teal-300" />
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{item.label}</p>
            </Link>
          ))}
        </div>
        <MobilePanel>
          <button
            type="button"
            onClick={() => void logout()}
            className={cn(
              "flex w-full items-center justify-center gap-2 px-4 py-4 text-sm font-semibold text-rose-600 dark:text-rose-400",
            )}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </MobilePanel>
      </div>
    );
  }

  const items = NAV_ITEMS.filter((item) => !item.section || canAccessSection(user, item.section));
  return (
    <div>
      <PageHeader title="More" description="All modules" />
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-2xl border border-border bg-card/70 p-4 text-sm font-medium hover:bg-accent"
          >
            <item.icon className="mb-2 h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
