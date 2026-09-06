import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker(options: { unavailableCache?: boolean } = {}) {
  const handlers = new Map<string, (event: any) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const key = (request: any) => new URL(typeof request === "string" ? request : request.url, "https://example.test").href;
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    open: async (name: string) => {
      if (options.unavailableCache) throw new Error("Storage unavailable");
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return { match: async (request: any) => store.get(key(request))?.clone(), put: async (request: any, response: Response) => { store.set(key(request), response.clone()); } };
    }
  };
  const fetch = vi.fn(async () => new Response("public", { headers: { "Content-Type": "text/css" } }));
  const clients = { claim: vi.fn(), matchAll: vi.fn(async () => [] as any[]), openWindow: vi.fn() };
  const showNotification = vi.fn();
  runInNewContext(readFileSync("public/sw.js", "utf8"), { URL, Response, Set, AbortController, setTimeout, clearTimeout, caches, fetch, self: { location: { origin: "https://example.test" }, addEventListener: (name: string, callback: any) => handlers.set(name, callback), skipWaiting: vi.fn(), clients, registration: { showNotification } } });
  async function dispatch(type: string, extra = {}) {
    const waits: Promise<unknown>[] = []; let response: Promise<Response> | undefined;
    handlers.get(type)!({ ...extra, waitUntil: (value: Promise<unknown>) => waits.push(value), respondWith: (value: Promise<Response>) => { response = value; } });
    const result = await response;
    await Promise.all(waits);
    return result;
  }
  const request = (url: string, mode = "cors", method = "GET") => dispatch("fetch", { request: { url: new URL(url, "https://example.test").href, mode, method } });
  return { caches, stores, fetch, clients, dispatch, request, showNotification };
}

describe("service worker privacy boundary", () => {
  it("migrates legacy app caches without deleting another application's data", async () => {
    const w = worker();
    await w.caches.open("jitm-shell-v1"); await w.caches.open("other-app"); await w.caches.open("jitm-public-v2");
    await w.dispatch("activate"); expect(await w.caches.keys()).toEqual(["other-app", "jitm-public-v2"]); expect(w.clients.claim).toHaveBeenCalled();
  });
  it("never saves private navigation and never serves a legacy cached page", async () => {
    const w = worker();
    const legacy = await w.caches.open("jitm-shell-v1");
    await legacy.put("/jumps?owner=alpha", new Response("Private Alpha"));
    w.fetch.mockResolvedValue(new Response("Private Beta", { headers: { "Cache-Control": "private, no-store" } }));
    expect(await (await w.request("/jumps?owner=beta", "navigate"))!.text()).toBe("Private Beta");
    expect(w.stores.size).toBe(1);
    w.fetch.mockRejectedValue(new Error("Offline"));
    const response = (await w.request("/jumps?owner=alpha", "navigate"))!;
    expect(response.status).toBe(503); const html = await response.text();
    expect(html).toContain("You’re offline"); expect(html).not.toContain("Private Alpha"); expect(html).not.toMatch(/<script|<link|<img/);
  });
  it("bypasses API, RSC, exports, non-GETs, external and arbitrary extension routes", async () => {
    const w = worker();
    for (const path of ["/api/contacts", "/jumps?_rsc=one", "/account/export.csv", "/private.js", "/api/avatar.png", "https://other.test/icon-192.png"]) expect(await w.request(path)).toBeUndefined();
    expect(await w.request("/_next/static/file.js", "cors", "POST")).toBeUndefined();
    expect(w.fetch).not.toHaveBeenCalled();
  });
  it("caches only public assets and ignores private, redirected and HTML responses", async () => {
    const w = worker();
    await w.request("/_next/static/public.css"); await w.request("/_next/static/public.css"); expect(w.fetch).toHaveBeenCalledTimes(1);
    for (const headers of [{ "Cache-Control": "private" }, { "Cache-Control": "no-store" }, { Vary: "Cookie" }, { "Content-Type": "text/html" }] as Record<string, string>[]) {
      w.fetch.mockResolvedValueOnce(new Response("private", { headers: { "Content-Type": "text/css", ...headers } }));
      await w.request("/_next/static/sensitive.css");
      expect(w.stores.get("jitm-public-v2")?.has("https://example.test/_next/static/sensitive.css")).toBe(false);
    }
    const redirect = new Response("redirected", { headers: { "Content-Type": "text/css" } }); Object.defineProperty(redirect, "redirected", { value: true });
    w.fetch.mockResolvedValueOnce(redirect); await w.request("/_next/static/redirect.css");
    expect(w.stores.get("jitm-public-v2")?.size).toBe(1);
  });
  it("works with blocked cache storage and does not hide real server errors", async () => {
    const w = worker({ unavailableCache: true });
    expect(await (await w.request("/_next/static/public.css"))!.text()).toBe("public");
    w.fetch.mockResolvedValue(new Response("Unavailable", { status: 503 }));
    expect(await (await w.request("/jumps", "navigate"))!.text()).toBe("Unavailable");
    w.fetch.mockRejectedValue(new Error("Offline"));
    expect(await (await w.request("/unvisited", "navigate"))!.text()).toContain("You’re offline");
  });
  it("displays only a queued push for the currently authenticated account", async () => {
    const w = worker(), scope = "a".repeat(64);
    const data = { json: () => ({ scope, subscriptionId: "device-a", title: "Follow-up reminder", body: "A ready follow-up", tag: "test" }) };
    w.fetch.mockResolvedValue(Response.json({ active: true }));
    await w.dispatch("push", { data });
    expect(w.showNotification).toHaveBeenCalledWith("Follow-up reminder", expect.objectContaining({ data: { scope, url: "/jumps?source=push" } }));
    expect(w.fetch).toHaveBeenCalledWith("/api/notifications/subscribe?subscriptionId=device-a", expect.objectContaining({ cache: "no-store", credentials: "same-origin", redirect: "error", headers: { "x-jitm-browser-scope": scope } }));
    w.showNotification.mockClear();
    for (const response of [Response.json({ active: false }), Response.json({ error: "Account changed" }, { status: 409 }), Response.json({ error: "Signed out" }, { status: 401 })]) {
      w.fetch.mockResolvedValue(response); await w.dispatch("push", { data });
    }
    w.fetch.mockRejectedValue(new Error("Offline")); await w.dispatch("push", { data });
    await w.dispatch("push", { data: { json: () => ({ title: "Legacy unscoped reminder" }) } });
    await w.dispatch("push", { data: { json: () => { throw new Error("Malformed"); } } });
    expect(w.showNotification).not.toHaveBeenCalled();
  });
  it("awaits same-origin navigation and ignores notification destination injection", async () => {
    const w = worker(), existing = { url: "https://example.test/jumps", navigate: vi.fn(), focus: vi.fn() };
    w.clients.matchAll.mockResolvedValue([existing]);
    await w.dispatch("notificationclick", { notification: { close: vi.fn(), data: { url: "https://evil.test" } } });
    expect(existing.navigate).toHaveBeenCalledWith("https://example.test/jumps?source=push"); expect(existing.focus).toHaveBeenCalled();
  });
});
