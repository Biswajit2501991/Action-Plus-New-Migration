"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { NAV_ITEMS, sectionHref } from "@/lib/nav";
import { canAccessSection } from "@/lib/domain/permissions";
import { useAuthStore } from "@/stores";

function sectionForPath(pathname: string) {
  const hit = NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  return hit?.section || null;
}

function firstAllowedHref(user: Parameters<typeof canAccessSection>[0]) {
  for (const item of NAV_ITEMS) {
    if (item.section && canAccessSection(user, item.section)) return item.href;
  }
  return sectionHref("Dashboard");
}

/** Block deep-links to sections the staff cannot access (desktop + shared routes). */
export function DesktopAccessGuard({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const pathname = usePathname();
  const router = useRouter();
  const section = sectionForPath(pathname || "/");
  const allowed = !section || canAccessSection(user, section);

  useEffect(() => {
    if (!user || allowed) return;
    router.replace(firstAllowedHref(user));
  }, [user, allowed, router]);

  if (!user) return null;
  if (!allowed) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-8">
        <p className="text-sm text-muted-foreground">
          This section is not enabled for your account.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
