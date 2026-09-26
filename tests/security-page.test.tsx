import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The public /security page is the Policy that security.txt points to. It uses the same public
// document layout as /privacy and /terms, and the footer's policy links now include it.
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: { href: string; children?: ReactNode }) => createElement("a", { href, ...props }, children) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw Object.assign(new Error("NEXT_NOT_FOUND"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }); } }));
vi.mock("@/components/Logo", () => ({ Logo: () => null }));
vi.mock("@/components/Appearance", () => ({ AppearanceControl: () => null }));

import SecurityPage, { metadata } from "../src/app/security/page";

const trust = { PUBLIC_OPERATOR_NAME: "Example Operator LLC", PUBLIC_SUPPORT_EMAIL: "support@jumpinthemix.com", PUBLIC_BACKUP_RETENTION_NOTICE: "Encrypted backups are kept for thirty days, then deleted." };
beforeEach(() => { for (const [name, value] of Object.entries(trust)) vi.stubEnv(name, value); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("security page", () => {
  it("publishes the reporting policy in the public document layout", () => {
    const html = renderToStaticMarkup(SecurityPage());
    expect(metadata.title).toBe("Security");
    expect(html).toContain('<main id="main-content" tabindex="-1" class="public-document">');
    expect(html).toContain("<h1>Security</h1>");
    expect(html).toContain("Example Operator LLC operates Jump in the Mix.");
    for (const heading of ["Report a problem", "What happens next", "Research in good faith", "What this covers", "Your own account"]) expect(html).toContain(`<h2>${heading}</h2>`);
    expect(html).toContain('href="mailto:security%40jumpinthemix.com">security@jumpinthemix.com</a>');
    expect(html).toContain('href="mailto:support%40jumpinthemix.com">support@jumpinthemix.com</a>');
    for (const href of ["/.well-known/security.txt", "/privacy", "/terms", "/forgot-password"]) expect(html).toContain(`href="${href}"`);
  });

  it("lists Security among the footer's policy links", () => {
    const html = renderToStaticMarkup(SecurityPage());
    const footer = html.slice(html.indexOf('aria-label="Policies and support"'));
    expect([...footer.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)].map(([, href, label]) => `${label} ${href}`)).toEqual(["Privacy /privacy", "Terms /terms", "Security /security", "Contact &amp; support /contact"]);
  });

  it("is not published until the operator's public details are configured", () => {
    vi.stubEnv("PUBLIC_SUPPORT_EMAIL", "");
    expect(() => renderToStaticMarkup(SecurityPage())).toThrow("NEXT_NOT_FOUND");
  });
});
