import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { request } from "node:https";

const blocked = new BlockList();
for (const [ip, prefix] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],["192.88.99.0",24],["192.168.0.0",16],["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",4],["240.0.0.0",4]] as const) blocked.addSubnet(ip, prefix, "ipv4");
for (const [ip, prefix] of [["2001::",23],["2001:db8::",32],["2002::",16],["3fff::",20]] as const) blocked.addSubnet(ip, prefix, "ipv6");
export function publicCalendarAddress(address: string) {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address, "ipv4") : family === 6 && /^[23][0-9a-f]{3}:/i.test(address) && !blocked.check(address, "ipv6");
}
export function calendarFeedUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw.replace(/^webcal:/i, "https:")); } catch { throw new Error("Enter a valid calendar subscription URL."); }
  if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password || url.hash || url.href.length > 4096) throw new Error("Use an HTTPS calendar URL without a username, password, or custom port.");
  return url;
}

// Resolve and pin the vetted address for the actual TLS request. A separate
// fetch after DNS validation would be vulnerable to DNS rebinding.
export async function fetchCalendarFeed(raw: string, redirects = 0): Promise<string> {
  const url = calendarFeedUrl(raw);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await Promise.race([lookup(host, { all: true }), new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error("Calendar lookup timed out.")), 5000); timer.unref(); })]);
  if (!addresses.length || addresses.some(item => !publicCalendarAddress(item.address))) throw new Error("Use a publicly reachable calendar provider URL.");
  const target = addresses.find(item => item.family === 4) ?? addresses[0];
  const response = await new Promise<{ body?: string; location?: string }>((resolve, reject) => {
    const req = request(url, { method: "GET", agent: false, family: target.family, headers: { Accept: "text/calendar", "Accept-Encoding": "identity" }, lookup: (_hostname, _options, callback) => callback(null, target.address, target.family) }, res => {
      if ([301,302,303,307,308].includes(res.statusCode ?? 0) && res.headers.location) { res.resume(); resolve({ location: res.headers.location }); return; }
      if (res.statusCode !== 200) { res.resume(); reject(new Error("The calendar provider did not return a calendar. Check its sharing settings.")); return; }
      let bytes = 0; const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 1_048_576) req.destroy(new Error("Calendar feeds must be 1 MB or smaller.")); else chunks.push(chunk); });
      res.on("end", () => resolve({ body: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    const timer = setTimeout(() => req.destroy(new Error("The calendar provider took too long to respond.")), 10_000);
    req.on("close", () => clearTimeout(timer)); req.on("error", reject); req.end();
  });
  if (response.location) { if (redirects >= 2) throw new Error("The calendar URL redirects too many times."); return fetchCalendarFeed(new URL(response.location, url).href, redirects + 1); }
  return response.body!;
}
