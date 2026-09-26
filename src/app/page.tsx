import type { Metadata } from "next";
import { PublicLanding } from "@/components/PublicLanding";
import { publicPageMetadata } from "@/lib/public-seo";

// The homepage answers one search intent, "client follow-up app", in its title, opening copy and
// the how-it-works section. Mix and Beat are explained before any section relies on them.
export const metadata: Metadata = publicPageMetadata({
  path: "/",
  title: "Client Follow-Up App",
  description: "Stay in the mix with client follow-up plans, message templates, and reminders. Choose the timing, review each draft, and send it yourself."
});

export default function HomePage() {
  return <PublicLanding />;
}
