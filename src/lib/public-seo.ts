import type { Metadata } from "next";
import { env } from "@/lib/env";

export const SITE_NAME = "Jump in the Mix";

// The plain product definition the search strategy asks to show on the homepage and reuse in
// structured data. Facts only: a web app, reusable plans called Mixes, scheduled steps called
// Beats, the person reviews and sends, and nothing reads or interprets replies.
export const PRODUCT_DEFINITION = "Jump in the Mix is a client follow-up web app for independent professionals. It organizes contacts into reusable follow-up plans called Mixes. Each Beat is a scheduled message or call step. You review and send messages yourself, and the app does not read or interpret replies.";

export function publicUrl(path: string): string {
  return new URL(path, env.appUrl).href;
}

const sharingImage = () => ({ url: publicUrl("/relationship-preview.png?v=4"), width: 1200, height: 630, alt: "Jump in the Mix. Good relationships have a rhythm." });

// One descriptive title, one description and one canonical URL per public page. The root
// layout appends the site name to the title.
export function publicPageMetadata({ path, title, description }: { path: string; title: string; description: string }): Metadata {
  const url = publicUrl(path);
  const image = sharingImage();
  return {
    // The layout's "%s | Jump in the Mix" template applies to nested segments only, so the
    // homepage spells its title out.
    title: path === "/" ? { absolute: `${title} | ${SITE_NAME}` } : title,
    description,
    alternates: { canonical: url },
    openGraph: { title: `${title} | ${SITE_NAME}`, description, url, siteName: SITE_NAME, type: "website", images: [image] },
    twitter: { card: "summary_large_image", title: `${title} | ${SITE_NAME}`, description, images: [image.url] }
  };
}

// Organization, WebSite and SoftwareApplication data limited to visible facts. No offers,
// prices, ratings, reviews or operating systems beyond the browser are described.
export function publicStructuredData() {
  const organization = publicUrl("/#organization");
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": organization, name: SITE_NAME, url: publicUrl("/"), logo: publicUrl("/brand-logo.png") },
      { "@type": "WebSite", "@id": publicUrl("/#website"), name: SITE_NAME, url: publicUrl("/"), publisher: { "@id": organization } },
      { "@type": "SoftwareApplication", "@id": publicUrl("/#application"), name: SITE_NAME, applicationCategory: "BusinessApplication", operatingSystem: "Web browser", url: publicUrl("/"), description: PRODUCT_DEFINITION, publisher: { "@id": organization } }
    ]
  };
}
