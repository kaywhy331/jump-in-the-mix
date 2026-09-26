import { BlockList, isIP } from "node:net";

/**
 * Client address behind trusted proxies (Cloudflare in front of Render).
 *
 * The first X-Forwarded-For hop is whatever the client sent, so it must never be trusted. The
 * walk goes from the right: every hop that belongs to a trusted proxy (private networks,
 * Cloudflare, or an operator-configured range) is skipped, and the first remaining hop is the
 * client. When every hop is trusted, the address is taken from CF-Connecting-IP only if the
 * nearest hop is a Cloudflare address (which proves Cloudflare set the header); otherwise the
 * caller gets null rather than a shared proxy address. The function never throws.
 */

/** Published by Cloudflare at https://www.cloudflare.com/ips-v4 and /ips-v6, retrieved 2026-09-24. */
export const CLOUDFLARE_RANGES = {
  retrievedAt: "2026-09-24",
  v4: [
    "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18",
    "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17",
    "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22"
  ],
  v6: ["2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32"]
} as const;

const PRIVATE_RANGES = {
  v4: ["0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.168.0.0/16"],
  v6: ["::/128", "::1/128", "fc00::/7", "fe80::/10"]
} as const;

export type ParsedAddress = { address: string; family: 4 | 6 };
export type ParsedCidr = ParsedAddress & { prefix: number };

/** Accepts "1.2.3.4", "1.2.3.4:443", "[::1]", "[::1]:443", quoted values and IPv4-mapped IPv6. */
export function parseAddress(raw: string | null | undefined): ParsedAddress | null {
  if (typeof raw !== "string") return null;
  let value = raw.trim().replace(/^"+|"+$/g, "");
  if (!value) return null;
  const bracketed = value.match(/^\[([^\]]+)\](?::\d{1,5})?$/);
  if (bracketed) value = bracketed[1];
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$/.test(value)) value = value.slice(0, value.lastIndexOf(":"));
  const mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped) value = mapped[1];
  const family = isIP(value);
  if (family === 4) return { address: value, family: 4 };
  if (family === 6) return { address: value.toLowerCase(), family: 6 };
  return null;
}

export function parseCidr(entry: string): ParsedCidr | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;
  const slash = trimmed.lastIndexOf("/");
  const base = parseAddress(slash === -1 ? trimmed : trimmed.slice(0, slash));
  if (!base) return null;
  if (slash === -1) return { ...base, prefix: base.family === 4 ? 32 : 128 };
  const suffix = trimmed.slice(slash + 1);
  if (!/^\d{1,3}$/.test(suffix)) return null;
  const prefix = Number(suffix);
  if (prefix > (base.family === 4 ? 32 : 128)) return null;
  return { ...base, prefix };
}

/**
 * Configuration problems in TRUSTED_PROXY_CIDRS, worded for productionConfigurationIssues().
 * Rejects unparseable entries, /0, IPv4 broader than /8 and IPv6 broader than /24.
 */
export function trustedProxyCidrIssues(entries: readonly string[]): string[] {
  const issues: string[] = [];
  for (const entry of entries) {
    const parsed = parseCidr(entry);
    if (!parsed) { issues.push(`TRUSTED_PROXY_CIDRS entry "${entry}" is not a valid IPv4 or IPv6 CIDR.`); continue; }
    if (parsed.prefix === 0) issues.push(`TRUSTED_PROXY_CIDRS entry "${entry}" would trust every address.`);
    else if (parsed.family === 4 && parsed.prefix < 8) issues.push(`TRUSTED_PROXY_CIDRS entry "${entry}" is broader than /8.`);
    else if (parsed.family === 6 && parsed.prefix < 24) issues.push(`TRUSTED_PROXY_CIDRS entry "${entry}" is broader than /24.`);
  }
  return issues;
}

type Lists = { trusted: BlockList; cloudflare: BlockList };
const listCache = new Map<string, Lists>();

function addRanges(list: BlockList, ranges: readonly string[]): void {
  for (const range of ranges) {
    const parsed = parseCidr(range);
    if (parsed && parsed.prefix > 0) list.addSubnet(parsed.address, parsed.prefix, parsed.family === 4 ? "ipv4" : "ipv6");
  }
}

function lists(trustedCidrs: readonly string[]): Lists {
  const key = trustedCidrs.join(",");
  const cached = listCache.get(key);
  if (cached) return cached;
  const cloudflare = new BlockList();
  addRanges(cloudflare, CLOUDFLARE_RANGES.v4);
  addRanges(cloudflare, CLOUDFLARE_RANGES.v6);
  const trusted = new BlockList();
  addRanges(trusted, CLOUDFLARE_RANGES.v4);
  addRanges(trusted, CLOUDFLARE_RANGES.v6);
  addRanges(trusted, PRIVATE_RANGES.v4);
  addRanges(trusted, PRIVATE_RANGES.v6);
  addRanges(trusted, trustedCidrs);
  const built = { trusted, cloudflare };
  listCache.set(key, built);
  return built;
}

function inList(list: BlockList, address: ParsedAddress): boolean {
  return list.check(address.address, address.family === 4 ? "ipv4" : "ipv6");
}

export function isCloudflareAddress(raw: string, trustedCidrs: readonly string[] = []): boolean {
  const parsed = parseAddress(raw);
  return Boolean(parsed && inList(lists(trustedCidrs).cloudflare, parsed));
}

export function isTrustedProxyAddress(raw: string, trustedCidrs: readonly string[] = []): boolean {
  const parsed = parseAddress(raw);
  return Boolean(parsed && inList(lists(trustedCidrs).trusted, parsed));
}

export type HeaderReader = (name: string) => string | null | undefined;

/**
 * The client address for rate limiting and session records, or null when it cannot be
 * established. See the module comment for the rule; the truth table lives in the unit tests.
 */
export function clientAddressFromHeaders(get: HeaderReader, options: { trustedCidrs?: readonly string[] } = {}): string | null {
  try {
    const { trusted, cloudflare } = lists(options.trustedCidrs ?? []);
    const forwarded = get("x-forwarded-for");
    const hops = typeof forwarded === "string" ? forwarded.split(",").map((hop) => hop.trim()).filter(Boolean) : [];
    for (let index = hops.length - 1; index >= 0; index -= 1) {
      const hop = parseAddress(hops[index]);
      if (!hop) return null; // garbage next to the client side of the chain: never store or trust it
      if (inList(trusted, hop)) continue;
      return hop.address;
    }
    if (hops.length === 0) return null;
    const nearest = parseAddress(hops[hops.length - 1]);
    if (!nearest || !inList(cloudflare, nearest)) return null;
    const connecting = parseAddress(get("cf-connecting-ip"));
    if (!connecting || inList(trusted, connecting)) return null;
    return connecting.address;
  } catch {
    return null;
  }
}
