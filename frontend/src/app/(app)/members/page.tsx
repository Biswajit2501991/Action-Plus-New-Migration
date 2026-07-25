"use client";

import { Suspense } from "react";
import { ResponsiveView } from "@/components/layout/responsive-view";
import { MembersPage } from "@/features/members/members-page";
import { MobileMembers } from "@/features/members/mobile-members";
import { Skeleton } from "@/components/ui/misc";

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ResponsiveView mobile={<MobileMembers />} desktop={<MembersPage />} />
    </Suspense>
  );
}
