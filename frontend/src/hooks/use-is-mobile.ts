"use client";

import { useEffect, useState } from "react";

/** True below Tailwind `lg` (1024px). `null` until mounted (avoids SSR mismatch). */
export function useIsMobile(breakpointPx = 1024): boolean | null {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [breakpointPx]);

  return isMobile;
}
