import type { Metadata } from "next";
import { Suspense } from "react";
import { GlobalLiveSearch } from "@/components/GlobalLiveSearch";
import "@/styles/index.css";

export const metadata: Metadata = {
  title: {
    default: "Jump in the Mix",
    template: "%s | Jump in the Mix"
  },
  description: "A simple relationship follow-through system for the people and opportunities that matter."
};

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
