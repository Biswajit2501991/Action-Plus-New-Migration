"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { Skeleton } from "@/components/ui/misc";

/** Renders only the mobile or desktop tree (not both), after breakpoint is known. */
export function ResponsiveView({
  mobile,
  desktop,
}: {
  mobile: React.ReactNode;
  desktop: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  if (isMobile === null) {
    return (
      <div className="space-y-3 py-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }
  return <>{isMobile ? mobile : desktop}</>;
}
