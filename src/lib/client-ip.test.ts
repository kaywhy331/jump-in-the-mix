import { describe, expect, it } from "vitest";
import { clientAddressFromHeaders, isCloudflareAddress, parseAddress, parseCidr, trustedProxyCidrIssues } from "@/lib/client-ip";

const CF = "104.16.10.20";
const CF6 = "2606:4700::6810:84e5";
const CLIENT = "203.0.113.9";
const FORGED = "198.51.100.1";

function headers(map: Record<string, string | undefined>) {
  return (name: string) => map[name.toLowerCase()] ?? null;
}

describe("clientAddressFromHeaders", () => {
  it("client, Cloudflare peer → client", () => {
    expect(clientAddressFromHeaders(headers({ "x-forwarded-for": `${CLIENT}, ${CF}` }))).toBe(CLIENT);
  });
  it("forged, client, Cloudflare peer → client (the first hop is never trusted)", () => {
    expect(clientAddressFromHeaders(headers({ "x-forwarded-for": `${FORGED}, ${CLIENT}, ${CF}` }))).toBe(CLIENT);
  });
  it("client only (direct to the origin host) → client", () => {
    expect(clientAddressFromHeaders(headers({ "x-forwarded-for": CLIENT }))).toBe(CLIENT);
  });
  it("forged, client (direct) → client", () => {
    expect(clientAddressFromHeaders(headers({ "x-forwarded-for": `${FORGED}, ${CLIENT}` }))).toBe(CLIENT);
  });
  it("Cloudflare peer only with CF-Connecting-IP → the connecting address", () => {
    expect(clientAddressFromHeaders(headers({ "x-forwarded-for": CF, "cf-connecting-ip": CLIENT }))).toBe(CLIENT);
    expect(clientAddressFromHeaders(headers({ "x-forwarded-for": CF6, "cf-connecting-ip": CLIENT }))).toBe(CLIENT);
  });
  it("client, Cloudflare peer, private Render hop → client", () => {
    expect(clientAddressFromHeaders(headers({ "x-forwarded-for": `${CLIENT}, ${CF}, 10.4.5.6` }))).toBe(CLIENT);
  });
  it("client, unknown public hop R → R until R is configured as trusted", () => {
    const chain = `${CLIENT}, 192.0.2.44`;
    expect(clientAddressFromHeaders(headers({ "x-forwarded-for": chain }))).toBe("192.0.2.44");
    expect(clientAddressFromHeaders(headers({ "x-forwarded-for": chain }), { trustedCidrs: ["192.0.2.0/24"] })).toBe(CLIENT);
  });
  it("internal hops only → null, never a shared proxy address", () => {
    expect(clientAddressFromHeaders(headers({ "x-forwarded-for": "10.0.0.1, 10.0.0.2" }))).toBeNull();
    expect(clientAddressFromHeaders(headers({ "x-forwarded-for": "10.0.0.1", "cf-connecting-ip": CLIENT }))).toBeNull();
  });
  it("garbage on the client side of the chain → null; garbage left of the client is ignored", () => {
    expect(clientAddressFromHeaders(headers({ "x-forwarded-for": `${CLIENT}, unknown` }))).toBeNull();
    expect(clientAddressFromHeaders(headers({ "x-forwarded-for": `garbage, ${CLIENT}, ${CF}` }))).toBe(CLIENT);
    expect(clientAddressFromHeaders(headers({ "x-forwarded-for": "not an address at all" }))).toBeNull();
  });
  it("no forwarded header → null (CF-Connecting-IP alone proves nothing)", () => {
    expect(clientAddressFromHeaders(headers({}))).toBeNull();
    expect(clientAddressFromHeaders(headers({ "cf-connecting-ip": CLIENT }))).toBeNull();
    expect(clientAddressFromHeaders(headers({ "x-real-ip": CLIENT }))).toBeNull();
  });
  it("a Cloudflare-set CF-Connecting-IP that is itself a proxy address is not returned", () => {
    expect(clientAddressFromHeaders(headers({ "x-forwarded-for": CF, "cf-connecting-ip": "10.1.1.1" }))).toBeNull();
  });
  it("accepts ports, brackets, quotes and IPv4-mapped IPv6", () => {
    expect(clientAddressFromHeaders(headers({ "x-forwarded-for": `"${CLIENT}:51234", [${CF6}]:443` }))).toBe(CLIENT);
    expect(clientAddressFromHeaders(headers({ "x-forwarded-for": `::ffff:${CLIENT}, ::ffff:${CF}` }))).toBe(CLIENT);
    expect(clientAddressFromHeaders(headers({ "x-forwarded-for": `2001:db8::1, ${CF6}` }))).toBe("2001:db8::1");
  });
  it("never throws on hostile input", () => {
    expect(clientAddressFromHeaders(() => { throw new Error("boom"); })).toBeNull();
    expect(clientAddressFromHeaders(headers({ "x-forwarded-for": ",,,,," }))).toBeNull();
    expect(clientAddressFromHeaders(headers({ "x-forwarded-for": "x".repeat(10_000) }))).toBeNull();
  });
});

describe("address and CIDR parsing", () => {
  it("parses addresses with ports and mapped forms", () => {
    expect(parseAddress("1.2.3.4:8080")).toEqual({ address: "1.2.3.4", family: 4 });
    expect(parseAddress("[2001:DB8::1]:443")).toEqual({ address: "2001:db8::1", family: 6 });
    expect(parseAddress("::ffff:1.2.3.4")).toEqual({ address: "1.2.3.4", family: 4 });
    expect(parseAddress("1.2.3")).toBeNull();
    expect(parseAddress("")).toBeNull();
  });
  it("parses CIDRs and rejects bad prefixes", () => {
    expect(parseCidr("192.0.2.0/24")).toEqual({ address: "192.0.2.0", family: 4, prefix: 24 });
    expect(parseCidr("2001:db8::/32")).toEqual({ address: "2001:db8::", family: 6, prefix: 32 });
    expect(parseCidr("192.0.2.7")).toEqual({ address: "192.0.2.7", family: 4, prefix: 32 });
    expect(parseCidr("192.0.2.0/33")).toBeNull();
    expect(parseCidr("nope/8")).toBeNull();
  });
  it("reports dangerous overrides", () => {
    expect(trustedProxyCidrIssues(["192.0.2.0/24", "2001:db8::/32"])).toEqual([]);
    expect(trustedProxyCidrIssues(["0.0.0.0/0"])).toHaveLength(1);
    expect(trustedProxyCidrIssues(["10.0.0.0/7"])).toHaveLength(1);
    expect(trustedProxyCidrIssues(["2001::/16"])).toHaveLength(1);
    expect(trustedProxyCidrIssues(["banana"])).toHaveLength(1);
  });
  it("recognises Cloudflare addresses in both families", () => {
    expect(isCloudflareAddress(CF)).toBe(true);
    expect(isCloudflareAddress(CF6)).toBe(true);
    expect(isCloudflareAddress(CLIENT)).toBe(false);
  });
});
