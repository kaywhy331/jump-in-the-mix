import { randomUUID } from "node:crypto";

const FIXTURE_KEY = "jitm-e2e-mail-fixture";
const FIXTURE_FROM = "test@example.test";

export function fixtureOrigin(source) {
  const app = new URL(source.APP_URL);
  const database = new URL(source.DATABASE_URL);
  if (
    source.PLAYWRIGHT_MAIL_FIXTURE !== "1" ||
    source.RESEND_API_KEY !== FIXTURE_KEY ||
    source.EMAIL_FROM !== FIXTURE_FROM ||
    source.BILLING_ENABLED !== "false" ||
    source.AUTOMATIC_CUSTOMER_EMAIL !== "false" ||
    source.PLAYWRIGHT_BASE_URL !== app.origin ||
    app.protocol !== "http:" || app.hostname !== "127.0.0.1" || !app.port ||
    app.username || app.password || app.pathname !== "/" || app.search || app.hash ||
    !["postgres:", "postgresql:"].includes(database.protocol) ||
    !["127.0.0.1", "localhost"].includes(database.hostname) ||
    !/^\/jitm_design_[a-z0-9_]+$/.test(database.pathname)
  ) throw new Error("Browser mail fixture requires explicit synthetic credentials and loopback fixtures.");
  return app.origin;
}

export function createMailFixture({ origin, localFetch, onCapture = () => {} }) {
  const local = new URL(origin);
  if (local.protocol !== "http:" || local.hostname !== "127.0.0.1" || !local.port || local.origin !== origin || typeof localFetch !== "function") {
    throw new Error("Browser mail fixture requires an exact loopback origin.");
  }
  return async (input, init = {}) => {
    const blocked = () => { throw new Error("Browser mail fixture blocked a non-fixture request."); };
    const target = new URL(input instanceof Request ? input.url : String(input));
    const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    // Next's server-action redirect reads may reach this same server, never another origin.
    if (target.origin === origin && method === "GET") {
      return localFetch(input, { ...init, redirect: "manual" });
    }
    if (target.href !== "https://api.resend.com/emails" || method !== "POST" ||
        new Headers(init.headers).get("authorization") !== `Bearer ${FIXTURE_KEY}`) return blocked();
    let body;
    try { body = JSON.parse(String(init.body)); } catch { return blocked(); }
    if (body.from !== FIXTURE_FROM || !Array.isArray(body.to) || body.to.length !== 1 ||
        !/^[^@\s]+@(?:example|exmaple)\.test$/i.test(body.to[0]) ||
        body.cc || body.bcc || typeof body.subject !== "string" || typeof body.text !== "string") return blocked();
    await onCapture(body);
    return new Response(JSON.stringify({ id: `browser-fixture-${randomUUID()}` }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  };
}

if (process.env.PLAYWRIGHT_MAIL_FIXTURE === "1") {
  const origin = fixtureOrigin(process.env);
  globalThis.fetch = createMailFixture({
    origin,
    localFetch: globalThis.fetch,
    // Record capture without retaining recipients, message bodies or bearer links in logs.
    onCapture: () => console.info("[browser-mail-fixture] Captured one synthetic message.")
  });
}
