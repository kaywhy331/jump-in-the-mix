import { SupportViewRecovery } from "@/components/SupportViewRecovery";
import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { headers } from "next/headers";
import localFont from "next/font/local";
import { appearanceScript } from "@/lib/appearance";
import { AppearanceSync } from "@/components/Appearance";
import { GlobalLiveSearch } from "@/components/GlobalLiveSearch";
import { PwaRegistration } from "@/components/PwaRegistration";
import { PublicConversionEvents } from "@/components/PublicConversionEvents";
import { env } from "@/lib/env";
import "@/styles/index.css";

const uiFont = localFont({ src: [
  { path: "./fonts/instrument-sans.ttf", weight: "400" },
  { path: "./fonts/instrument-sans-1.ttf", weight: "500" },
  { path: "./fonts/instrument-sans-2.ttf", weight: "600" },
  { path: "./fonts/instrument-sans-3.ttf", weight: "700" }
], variable: "--font-instrument", display: "swap" });
const voiceFont = localFont({ src: "./fonts/newsreader.ttf", weight: "400", variable: "--font-newsreader", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Jump in the Mix",
    template: "%s | Jump in the Mix"
  },
  description: "A client follow-up app for independent professionals: follow-up plans, message templates, and reminders you review and send yourself.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon.png?v=4", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png?v=4", sizes: "180x180", type: "image/png" }]
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "JITM" }
};

export const viewport = { themeColor: "#5d4cf2", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The request's CSP nonce must also be present on public-page scripts.
  // A static document cannot carry a fresh nonce for each response.
  await connection();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${uiFont.variable} ${voiceFont.variable}`} suppressHydrationWarning>
      <head><script nonce={nonce} dangerouslySetInnerHTML={{ __html: appearanceScript }} /></head>
      <body>
        <AppearanceSync />
        <PwaRegistration />
        <PublicConversionEvents />
        {env.privateTestMode && <aside role="note" style={{ padding: "8px 16px", textAlign: "center", background: "#fff0c2", color: "#4a3500", fontSize: "14px" }}>Private test site. Use sample data only.</aside>}
        <Suspense fallback={null}><GlobalLiveSearch /></Suspense>
        <SupportViewRecovery />{children}
      </body>
    </html>
  );
}
