import type { MetadataRoute } from "next";
import { PUBLIC_DOCUMENT_PATHS, publicIndexOrigin } from "@/lib/public-trust";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const origin = publicIndexOrigin();
  if (!origin) return { rules: { userAgent: "*", disallow: "/" } };
  return { rules: { userAgent: "*", disallow: "/", allow: [...PUBLIC_DOCUMENT_PATHS.map(path => `${path}$`), "/robots.txt$", "/sitemap.xml$", "/_next/static/", "/_next/image", "/brand-logo.png$", "/relationship-preview.png$", "/product-proof/"] }, sitemap: `${origin}/sitemap.xml` };
}
