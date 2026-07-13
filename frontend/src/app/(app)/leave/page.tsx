"use client";

import { ResponsiveView } from "@/components/layout/responsive-view";
import { LeavePage } from "@/features/leave/leave-page";
import { MobileLeave } from "@/features/leave/mobile-leave";

export default function Page() {
  return <ResponsiveView mobile={<MobileLeave />} desktop={<LeavePage />} />;
}
