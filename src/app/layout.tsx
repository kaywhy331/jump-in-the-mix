import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Jump in the Mix",
    template: "%s | Jump in the Mix"
  },
  description: "A simple relationship follow-up system for the people and opportunities that matter."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
