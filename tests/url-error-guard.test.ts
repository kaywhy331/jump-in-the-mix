import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * B11 guard: a message reaches a page's error banner through the URL only when our redirect signed it
 * (form-errors.ts). Public pages verify with verifiedErrorMessage; signed-in pages verify for their viewer.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "generated" ? [] : files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}
const sources = files("src").map(path => ({ path, text: readFileSync(path, "utf8") }));
const signers = new Set(["src/lib/form-errors.ts"]);
// A2's public sign-in fail(): its messages reach the form in-band (recoverableFormAction); a redirect it makes is
// unsigned and public pages show their fixed sentence for it.
const unsignedPublic = new Set(["src/lib/auth-actions.ts"]);

describe("URL error messages", () => {
  it("are built only by the signing helpers", () => {
    const producer = /error=\$\{|["'`][^"'`\n]*[?&]error=|withParam\([^)\n]*["']error["']|destination\(["']error["']|searchParams\.(set|append)\(["']error["']|adminActionDestination\([^)\n]*\{[^}\n]*\berror\s*:|adminQuery\([^)\n]*\berror\s*:/;
    const offenders = sources.filter(({ path, text }) => !signers.has(path) && !unsignedPublic.has(path) && text.split("\n").some(line => producer.test(line) && !/^\s*(\*|\/\/)/.test(line)));
    expect(offenders.map(file => file.path)).toEqual([]);
  });

  it("are never rendered raw by a page or component", () => {
    const raw = /\{\s*(query|params|search|searchParams|sp)\.error\s*\}|String\((query|params|search|searchParams)\.error\)|(query|params|search|searchParams)\.error\)?\.slice\(/;
    expect(sources.filter(({ text }) => raw.test(text)).map(file => file.path)).toEqual([]);
  });

  it("are read only through a verification helper", () => {
    const reads = /\b(query|params|search|searchParams|sp)\.error\b|const \{[^}]*\berror\b[^}]*\} = (await )?(searchParams|params|query)\b/;
    const verifies = /UrlErrorNotice|viewerErrorMessage|verifiedErrorMessage/;
    const pages = sources.filter(({ path }) => path.startsWith("src/app/") || path.startsWith("src/components/"));
    expect(pages.filter(({ text }) => reads.test(text) && !verifies.test(text)).map(file => file.path)).toEqual([]);
  });

  it("on signed-in pages, are verified for the viewer, not with the public signature", () => {
    const signedIn = sources.filter(({ path }) => /^src\/app\/\((app|staff)\)\//.test(path) || ["src/app/onboarding/page.tsx", "src/components/ContactProfile.tsx", "src/components/MixWorkspace.tsx"].includes(path));
    expect(signedIn.filter(({ text }) => /verifiedErrorMessage/.test(text)).map(file => file.path)).toEqual([]);
  });

  it("keep the signed-in banner server-side", () => {
    const notice = readFileSync("src/components/UrlErrorNotice.tsx", "utf8");
    expect(notice).not.toMatch(/^["']use client["']/m);
  });
});
