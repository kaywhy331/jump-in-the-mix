import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// public/.well-known/security.txt (RFC 9116) tells researchers where to report a vulnerability.
// A lapsed Expires date tells them the contacts are stale, so this fails 30 days before it.
const FILE = "public/.well-known/security.txt";
const DAY = 24 * 60 * 60_000;
const text = readFileSync(FILE, "utf8");
const fields = text.split("\n").map(line => line.trim()).filter(line => line && !line.startsWith("#")).map(line => {
  const separator = line.indexOf(":");
  return { name: line.slice(0, separator).trim().toLowerCase(), value: line.slice(separator + 1).trim() };
});
const values = (name: string) => fields.filter(field => field.name === name).map(field => field.value);

describe("security.txt", () => {
  it("stays at least 30 days from expiry and at most a year ahead", () => {
    const [expires, ...extra] = values("expires");
    expect(extra, "Expires must appear exactly once").toEqual([]);
    expect(expires, "Expires must be an ISO 8601 date and time in UTC").toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/);
    const remaining = Date.parse(expires) - Date.now();
    expect(remaining, `${FILE} expires on ${expires}. Set a new Expires date, at most a year ahead, and publish it.`).toBeGreaterThan(30 * DAY);
    expect(remaining, "RFC 9116 recommends an Expires date less than a year ahead").toBeLessThanOrEqual(366 * DAY);
  });

  it("names the security address first, then support", () => {
    expect(values("contact")).toEqual(["mailto:security@jumpinthemix.com", "mailto:support@jumpinthemix.com"]);
  });

  it("points to the published file, the public policy page and English", () => {
    expect(values("canonical")).toEqual(["https://jumpinthemix.com/.well-known/security.txt"]);
    expect(values("policy")).toEqual(["https://jumpinthemix.com/security"]);
    expect(values("preferred-languages")).toEqual(["en"]);
    expect(fields.map(field => field.name).sort()).toEqual(["canonical", "contact", "contact", "expires", "policy", "preferred-languages"]);
  });

  it("is plain UTF-8 text with one field per line", () => {
    expect(text.endsWith("\n")).toBe(true);
    expect(text).not.toMatch(/\r|\t|[^\x20-\x7e\n]/);
  });

  it("matches the policy page, its footer link and SECURITY.md", () => {
    expect(existsSync("src/app/security/page.tsx")).toBe(true);
    const page = readFileSync("src/app/security/page.tsx", "utf8");
    expect(page).toContain('const SECURITY_EMAIL = "security@jumpinthemix.com";');
    expect(page).toContain("PublicDocument");
    expect(readFileSync("src/components/PublicTrustLinks.tsx", "utf8")).toContain('<Link href="/security">Security</Link>');
    const policy = readFileSync("SECURITY.md", "utf8");
    for (const address of ["security@jumpinthemix.com", "support@jumpinthemix.com", "https://jumpinthemix.com/security", "https://jumpinthemix.com/.well-known/security.txt"]) expect(policy).toContain(address);
    // The Render build copies public/ (with this dot-directory) into the standalone package.
    expect(readFileSync("render.yaml", "utf8")).toContain("cp -R public .next/standalone/");
  });
});
