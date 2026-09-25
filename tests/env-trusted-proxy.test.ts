import { afterEach, describe, expect, it, vi } from "vitest";
import { productionConfigurationIssues } from "../src/lib/env";

function proxyIssues(source: Record<string, string> = {}): string[] {
  return productionConfigurationIssues({ ...source, NODE_ENV: "production" }).filter((issue) => issue.startsWith("TRUSTED_PROXY_CIDRS"));
}

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("TRUSTED_PROXY_CIDRS", () => {
  it("defaults to no extra trusted ranges and trims a comma-separated list", async () => {
    vi.stubEnv("TRUSTED_PROXY_CIDRS", "");
    vi.resetModules();
    expect((await import("../src/lib/env")).env.trustedProxyCidrs).toEqual([]);
    vi.stubEnv("TRUSTED_PROXY_CIDRS", " 192.0.2.0/24 ,, 2001:db8::/32 ");
    vi.resetModules();
    expect((await import("../src/lib/env")).env.trustedProxyCidrs).toEqual(["192.0.2.0/24", "2001:db8::/32"]);
  });

  it("accepts an unset variable and a list of specific ranges", () => {
    expect(proxyIssues({})).toEqual([]);
    expect(proxyIssues({ TRUSTED_PROXY_CIDRS: "192.0.2.0/24, 2001:db8::/32, 198.51.100.7" })).toEqual([]);
  });

  it("fails readiness for an override that is invalid or too broad", () => {
    expect(proxyIssues({ TRUSTED_PROXY_CIDRS: "banana" })).toEqual(['TRUSTED_PROXY_CIDRS entry "banana" is not a valid IPv4 or IPv6 CIDR.']);
    expect(proxyIssues({ TRUSTED_PROXY_CIDRS: "0.0.0.0/0" })).toEqual(['TRUSTED_PROXY_CIDRS entry "0.0.0.0/0" would trust every address.']);
    expect(proxyIssues({ TRUSTED_PROXY_CIDRS: "::/0" })).toEqual(['TRUSTED_PROXY_CIDRS entry "::/0" would trust every address.']);
    expect(proxyIssues({ TRUSTED_PROXY_CIDRS: "10.0.0.0/7" })).toEqual(['TRUSTED_PROXY_CIDRS entry "10.0.0.0/7" is broader than /8.']);
    expect(proxyIssues({ TRUSTED_PROXY_CIDRS: "2001::/16" })).toEqual(['TRUSTED_PROXY_CIDRS entry "2001::/16" is broader than /24.']);
    expect(proxyIssues({ TRUSTED_PROXY_CIDRS: "192.0.2.0/24,banana,::/0" })).toHaveLength(2);
  });

  it("checks the override in pilot and private test deployments too, but not outside production", () => {
    expect(proxyIssues({ PILOT_MODE: "true", APP_URL: "http://localhost:3000", TRUSTED_PROXY_CIDRS: "banana" })).toHaveLength(1);
    expect(proxyIssues({ PRIVATE_TEST_MODE: "true", PRIVATE_TEST_USERNAME: "tester", PRIVATE_TEST_PASSWORD: "s".repeat(40), TRUSTED_PROXY_CIDRS: "0.0.0.0/0" })).toHaveLength(1);
    expect(productionConfigurationIssues({ NODE_ENV: "development", TRUSTED_PROXY_CIDRS: "0.0.0.0/0" })).toEqual([]);
  });
});
