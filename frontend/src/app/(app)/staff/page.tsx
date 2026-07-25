"use client";

import { ResponsiveView } from "@/components/layout/responsive-view";
import { StaffPage } from "@/features/staff/staff-page";
import { MobileStaff } from "@/features/staff/mobile-staff";

export default function Page() {
  return <ResponsiveView mobile={<MobileStaff />} desktop={<StaffPage />} />;
}
