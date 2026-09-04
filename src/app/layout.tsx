import type { Metadata } from "next";
import { Suspense } from "react";
import { GlobalLiveSearch } from "@/components/GlobalLiveSearch";
import "@/styles/index.css";

export const metadata: Metadata = {
  title: {
    default: "Jump in the Mix",
    template: "%s | Jump in the Mix"
  },
  description: "A phone-first CRM that keeps small-business follow-ups moving.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "JITM" }
};

export const viewport = { themeColor: "#5d4cf2", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <Suspense fallback={null}><GlobalLiveSearch /></Suspense>
        {children}
      </body>
    </html>
  );
}
