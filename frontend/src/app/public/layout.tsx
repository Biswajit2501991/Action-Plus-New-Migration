import type { Metadata } from "next";

/**
 * Public surfaces (visitor form, punch kiosk) must not inherit the Gym Manager
 * PWA manifest — that start_url "/" sends Home Screen launches to login.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: false,
  },
  manifest: undefined,
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return children;
}
