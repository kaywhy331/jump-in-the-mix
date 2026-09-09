import type { MetadataRoute } from "next";
import { PUBLIC_DOCUMENT_PATHS, publicIndexOrigin } from "@/lib/public-trust";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = publicIndexOrigin();
  return origin ? PUBLIC_DOCUMENT_PATHS.map(path => ({ url: new URL(path, origin).href })) : [];
}
