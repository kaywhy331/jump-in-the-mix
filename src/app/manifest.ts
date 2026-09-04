import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jump in the Mix",
    short_name: "JITM",
    description: "A phone-first CRM that keeps small-business follow-ups moving.",
    start_url: "/jumps?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#f7f7fb",
    theme_color: "#5d4cf2",
    orientation: "portrait-primary",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ],
    shortcuts: [
      { name: "Today", short_name: "Today", url: "/jumps", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Add a person", short_name: "Add", url: "/contacts/new", icons: [{ src: "/icon-192.png", sizes: "192x192" }] }
    ]
  };
}
