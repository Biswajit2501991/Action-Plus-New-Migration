"use client";

import { useEffect, useState } from "react";

/**
 * Phones only. Tablets (md+) use the desktop shell with a denser type scale.
 * Matches Tailwind `md` (768px). `null` until mounted (avoids SSR mismatch).
 */
export const MOBILE_BREAKPOINT_PX = 768;

export function useIsMobile(breakpointPx = MOBILE_BREAKPOINT_PX): boolean | null {
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
