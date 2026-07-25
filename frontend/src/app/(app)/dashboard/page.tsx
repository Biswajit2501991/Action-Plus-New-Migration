"use client";

import { ResponsiveView } from "@/components/layout/responsive-view";
import { DashboardPage } from "@/features/dashboard/dashboard-page";
import { MobileDashboard } from "@/features/dashboard/mobile-dashboard";

export default function Page() {
  return <ResponsiveView mobile={<MobileDashboard />} desktop={<DashboardPage />} />;
}
