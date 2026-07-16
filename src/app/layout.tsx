import type { Metadata } from "next";
import "./globals.css";
import "./prd-core.css";
import "./prd-date-types.css";
import "./prd-bulk.css";
import "./prd-auth.css";
import "./prd-admin.css";
import "./prd-import.css";
import "./prd-google.css";
import "./prd-templates.css";
import "./prd-ai.css";
import "./prd-billing.css";

export const metadata: Metadata = {
  title: {
    default: "Jump in the Mix",
    template: "%s | Jump in the Mix"
  },
  description: "A simple relationship follow-through system for the people and opportunities that matter."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
