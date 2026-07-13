"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Fallback if config redirect is skipped — avoids server `redirect()` Internal Server Error. */
export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Loading Action Plus…
    </div>
  );
}
