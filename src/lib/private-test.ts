import { createHash, timingSafeEqual } from "node:crypto";

export function privateTestEnabled(source: NodeJS.ProcessEnv = process.env): boolean {
  return source.PRIVATE_TEST_MODE?.toLowerCase() === "true";
}

export function privateTestConfigurationIssues(source: NodeJS.ProcessEnv = process.env): string[] {
  if (!privateTestEnabled(source)) return [];
  const issues: string[] = [];
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(source.PRIVATE_TEST_USERNAME ?? "")) {
    issues.push("PRIVATE_TEST_USERNAME must contain 1–80 letters, numbers, dots, underscores, or hyphens");
  }
  if ((source.PRIVATE_TEST_PASSWORD ?? "").length < 32) {
    issues.push("PRIVATE_TEST_PASSWORD must contain at least 32 characters");
  }
  if (source.PRIVATE_TEST_EXPIRES_AT) {
    const expiry = Date.parse(source.PRIVATE_TEST_EXPIRES_AT);
    if (!Number.isFinite(expiry) || expiry <= Date.now()) issues.push("The private test deployment has expired or has an invalid expiry");
  }
  if (source.PILOT_MODE?.toLowerCase() === "true") issues.push("PRIVATE_TEST_MODE cannot be combined with PILOT_MODE");
  return issues;
}

export function privateTestRequestAuthorized(headers: Pick<Headers, "get">, source: NodeJS.ProcessEnv = process.env): boolean {
  if (!privateTestEnabled(source)) return true;
  if (privateTestConfigurationIssues(source).length) return false;
  const expected = `Basic ${Buffer.from(`${source.PRIVATE_TEST_USERNAME}:${source.PRIVATE_TEST_PASSWORD}`).toString("base64")}`;
  const supplied = headers.get("authorization") ?? "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(expected), digest(supplied));
}
