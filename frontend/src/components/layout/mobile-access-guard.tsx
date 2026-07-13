"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  canAccessMobilePath,
  firstAllowedMobileHref,
  hasAccess,
} from "@/lib/domain/permissions";
import { useAuthStore } from "@/stores";
import { MobilePanel } from "@/components/layout/mobile-ui";

/** Redirect away from mobile routes the staff is not allowed to open. */
export function MobileAccessGuard({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const pathname = usePathname();
  const router = useRouter();
  const allowed = canAccessMobilePath(user, pathname || "/");

  useEffect(() => {
    if (!user || allowed) return;
    router.replace(firstAllowedMobileHref(user));
  }, [user, allowed, router]);

  if (!user) return null;
  if (!allowed) {
    return (
      <MobilePanel>
        <p className="px-4 py-8 text-center text-sm text-slate-500">
          This mobile screen is not enabled for your account.
        </p>
      </MobilePanel>
    );
  }
  return <>{children}</>;
}

export function useMobileFeatureAccess() {
  const user = useAuthStore((s) => s.user);
  return {
    homeCoreStats: hasAccess(user, "mobile", "homeCoreStats"),
    homeRevenue: hasAccess(user, "mobile", "homeRevenue"),
    homeOverdue: hasAccess(user, "mobile", "homeOverdue"),
    membersAdd: hasAccess(user, "mobile", "membersAdd"),
    membersEdit: hasAccess(user, "mobile", "membersEdit"),
    leaveCreate: hasAccess(user, "mobile", "leaveCreate"),
    leaveApprove: hasAccess(user, "mobile", "leaveApprove"),
    viewMore: hasAccess(user, "mobile", "viewMore"),
  };
}
