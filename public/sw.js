const CACHE = "jitm-public-v4";
const PUBLIC_ICONS = new Set(["/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/favicon.png"]);

// Self-contained: no saved account HTML, scripts, fonts, or connection needed.
const OFFLINE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#5d4cf2"><title>Offline | Jump in the Mix</title><style>
:root{color-scheme:light dark;font-family:system-ui,sans-serif;background:#f6f5fb;color:#252238}*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px}main{width:100%;max-width:460px;padding:32px;background:#fff;border:1px solid #d6d2e4;border-radius:20px}p{line-height:1.6}h1{font-size:28px}a{display:inline-flex;align-items:center;min-height:48px;padding:12px 20px;border-radius:10px;background:#5140d4;color:#fff;font-weight:650;text-decoration:none}a:focus-visible{outline:3px solid #252238;outline-offset:4px}@media(prefers-color-scheme:dark){:root{background:#171522;color:#f6f4ff}main{background:#242132;border-color:#656077}a{background:#c1b9ff;color:#21164e}a:focus-visible{outline-color:#f6f4ff}}
</style></head><body><main><p>Jump in the Mix</p><h1>You’re offline</h1><p>Reconnect to see your contacts and follow-ups. Your saved work will be there when you’re back online.</p><a href="/jumps">Try again</a></main></body></html>`;

function offlineResponse() {
  return new Response(OFFLINE, { status: 503, headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff"
  } });
}

self.addEventListener("install", (event) => { event.waitUntil(self.skipWaiting()); });
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Migrate only this application's caches; other apps on the origin own theirs.
    try { await Promise.all((await caches.keys()).filter(key => key.startsWith("jitm-") && key !== CACHE).map(key => caches.delete(key))); } catch { /* Offline safety never depends on reading a legacy cache. */ }
    await self.clients.claim();
  })());
});

function cacheable(response) {
  return response.ok && !response.redirected
    && !/\b(private|no-store|no-cache)\b/i.test(response.headers.get("Cache-Control") || "")
    && !/(?:cookie|authorization|\*)/i.test(response.headers.get("Vary") || "")
    && /^(?:text\/css|(?:text|application)\/javascript|image\/(?:png|svg\+xml|x-icon|vnd.microsoft.icon)|font\/)/i.test(response.headers.get("Content-Type") || "");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request, { cache: "no-store" }).catch(offlineResponse));
    return;
  }
  // HTML, RSC, APIs, downloads and arbitrary extension-shaped routes are network-only.
  if (url.pathname.startsWith("/_next/static/") || PUBLIC_ICONS.has(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.open(CACHE).then(cache => cache.match(request)).catch(() => undefined);
      if (cached) return cached;
      const response = await fetch(request);
      if (cacheable(response)) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)).catch(() => undefined));
      }
      return response;
    })());
  }
});

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let timer;
    try {
      const payload = event.data?.json();
      // Old/unscoped payloads and a previous account's queued deliveries must
      // not expose reminder text to whoever currently owns the browser.
      if (!payload || typeof payload.scope !== "string" || !/^[a-f0-9]{64}$/.test(payload.scope)) return;
      if (typeof payload.subscriptionId !== "string" || !payload.subscriptionId || payload.subscriptionId.length > 200) return;
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), 8_000);
      const response = await fetch(`/api/notifications/subscribe?subscriptionId=${encodeURIComponent(payload.subscriptionId)}`, {
        cache: "no-store", credentials: "same-origin", redirect: "error", signal: controller.signal,
        headers: { "x-jitm-browser-scope": payload.scope }
      });
      if (!response.ok || (await response.json()).active !== true) return;
      await self.registration.showNotification(typeof payload.title === "string" ? payload.title.slice(0, 120) : "Jump in the Mix", {
        body: typeof payload.body === "string" ? payload.body.slice(0, 400) : "You have a follow-up ready.",
        icon: "/icon-192.png", badge: "/favicon.png", tag: typeof payload.tag === "string" ? payload.tag.slice(0, 120) : "jitm-follow-up",
        data: { url: "/jumps?source=push", scope: payload.scope }
      });
    } catch { /* Unconfirmed identity must not display account-specific text. */ }
    finally { clearTimeout(timer); }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Notification payloads cannot send a tab to another origin or an action URL.
  const target = new URL("/jumps?source=push", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async clients => {
    const existing = clients.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.navigate(target); return existing.focus(); }
    return self.clients.openWindow(target);
  }));
});
