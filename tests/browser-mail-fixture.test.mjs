import { describe, expect, it, vi } from "vitest";
import { createMailFixture, fixtureOrigin } from "../scripts/browser-mail-fixture.mjs";

const origin = "http://127.0.0.1:3000";
const environment = {
  PLAYWRIGHT_MAIL_FIXTURE: "1", APP_URL: origin, PLAYWRIGHT_BASE_URL: origin,
  DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:5432/jitm_design_ci?schema=public",
  RESEND_API_KEY: "jitm-e2e-mail-fixture", EMAIL_FROM: "test@example.test",
  BILLING_ENABLED: "false", AUTOMATIC_CUSTOMER_EMAIL: "false"
};
const message = { from: "test@example.test", to: ["invited-fixture@example.test"], subject: "Synthetic verification", text: "Synthetic content" };
const request = (overrides = {}) => ({
  method: "POST", headers: { authorization: "Bearer jitm-e2e-mail-fixture" },
  body: JSON.stringify(message), ...overrides
});

describe("browser mail fixture transport", () => {
  it("requires an explicit loopback database, origin, dummy credential and disabled sending/billing", () => {
    expect(fixtureOrigin(environment)).toBe(origin);
    for (const changes of [
      { PLAYWRIGHT_MAIL_FIXTURE: "" }, { DATABASE_URL: "postgresql://fixture:fixture@db.example.test/jitm_design_ci" },
      { DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:5432/customer_data" },
      { APP_URL: "https://app.example.test", PLAYWRIGHT_BASE_URL: "https://app.example.test" },
      { PLAYWRIGHT_BASE_URL: "http://127.0.0.1:3001" }, { RESEND_API_KEY: "different-fixture" },
      { EMAIL_FROM: "different@example.test" }, { BILLING_ENABLED: "true" },
      { AUTOMATIC_CUSTOMER_EMAIL: "true" }
    ]) expect(() => fixtureOrigin({ ...environment, ...changes })).toThrow();
  });

  it("captures only synthetic recipients and never calls the provider", async () => {
    const localFetch = vi.fn();
    const onCapture = vi.fn();
    const capture = createMailFixture({ origin, localFetch, onCapture });
    for (const domain of ["example.test", "exmaple.test"]) {
      const body = { ...message, to: [`invited-fixture@${domain}`] };
      const result = await capture("https://api.resend.com/emails", request({ body: JSON.stringify(body) }));
      expect(result.status).toBe(200);
      expect((await result.json()).id).toMatch(/^browser-fixture-/);
      expect(onCapture).toHaveBeenLastCalledWith(body);
    }
    expect(localFetch).not.toHaveBeenCalled();
  });

  it("fails closed for other recipients, credentials, methods, targets and extra addressees", async () => {
    const localFetch = vi.fn();
    const onCapture = vi.fn();
    const capture = createMailFixture({ origin, localFetch, onCapture });
    for (const [target, options] of [
      ["https://api.resend.com/emails", request({ body: JSON.stringify({ ...message, to: ["someone@example.com"] }) })],
      ["https://api.resend.com/emails", request({ body: JSON.stringify({ ...message, cc: ["other@example.test"] }) })],
      ["https://api.resend.com/emails", request({ body: JSON.stringify({ ...message, bcc: ["other@example.test"] }) })],
      ["https://api.resend.com/emails", request({ body: JSON.stringify({ ...message, from: "other@example.test" }) })],
      ["https://api.resend.com/emails", request({ headers: { authorization: "Bearer other-fixture" } })],
      ["https://api.resend.com/emails", request({ method: "GET" })],
      ["https://api.resend.com/emails", request({ body: "invalid JSON" })],
      ["https://outside.example.test", request()],
      [origin + "/unsafe-write", request()]
    ]) await expect(capture(target, options)).rejects.toThrow("blocked a non-fixture request");
    expect(localFetch).not.toHaveBeenCalled();
    expect(onCapture).not.toHaveBeenCalled();
  });

  it("permits only local GET reads and prevents following their redirects off-origin", async () => {
    const localFetch = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://outside.example.test" } }));
    const capture = createMailFixture({ origin, localFetch });
    const result = await capture(origin + "/login", { redirect: "follow" });
    expect(result.status).toBe(302);
    expect(localFetch).toHaveBeenCalledTimes(1);
    expect(localFetch).toHaveBeenCalledWith(origin + "/login", { redirect: "manual" });
    await expect(capture(new Request(origin + "/write", { method: "POST" }))).rejects.toThrow("blocked a non-fixture request");
    expect(localFetch).toHaveBeenCalledTimes(1);
  });
});
