"use client";

import { ResponsiveView } from "@/components/layout/responsive-view";
import { PtPage } from "@/features/pt/pt-page";
import { MobilePt } from "@/features/pt/mobile-pt";

export default function Page() {
  return <ResponsiveView mobile={<MobilePt />} desktop={<PtPage />} />;
}
