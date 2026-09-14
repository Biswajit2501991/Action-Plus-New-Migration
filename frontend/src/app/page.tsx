"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { firstAllowedWebHref } from "@/lib/domain/permissions";
import { useAuthStore } from "@/stores";

/** Fallback if config redirect is skipped — avoids server `redirect()` Internal Server Error. */
export default function HomePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  useEffect(() => {
    router.replace(firstAllowedWebHref(user));
  }, [router, user]);
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Loading Action Plus…
    </div>
  );
}
