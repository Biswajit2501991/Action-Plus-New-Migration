import type { Metadata, Viewport } from "next";
import { AppProviders } from "@/providers/app-providers";
import "./globals.css";

/** Bump when home-screen icons change — iOS caches apple-touch-icon by URL path. */
const ICON_V = "v1";

export const metadata: Metadata = {
  title: "Action Plus Gym Manager",
  description: "Modern gym management frontend for Action Plus",
  applicationName: "Action Plus Gym Manager",
  appleWebApp: {
    capable: true,
    title: "APG Manager",
    statusBarStyle: "default",
  },
  icons: {
    apple: [{ url: `/apg-mgr-touch-${ICON_V}-180.png`, sizes: "180x180", type: "image/png" }],
    icon: [
      { url: `/apg-mgr-icon-${ICON_V}-192.png`, sizes: "192x192", type: "image/png" },
      { url: `/apg-mgr-icon-${ICON_V}-512.png`, sizes: "512x512", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
  },
  manifest: `/manifest-gym-manager.webmanifest?${ICON_V}`,
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
