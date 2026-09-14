import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { recoveryBoundaryStatus } from "@/lib/recovery-boundary-client";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const privateSite = { PRIVATE_TEST_MODE: "true", PRIVATE_TEST_USERNAME: "tester", PRIVATE_TEST_PASSWORD: "s".repeat(40) };
const siteCredentials = `Basic ${Buffer.from(`tester:${"s".repeat(40)}`).toString("base64")}`;

describe("recovery boundary client", () => {
  it.each(["clear", "held"] as const)("accepts the bounded %s response from the configured deploy", async status => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(recoveryBoundaryStatus(new NextRequest("https://preview.example.test/contacts"))).resolves.toBe(status);
    expect(fetchMock).toHaveBeenCalledWith(new URL("https://preview.example.test/api/health/recovery-boundary"), expect.objectContaining({ cache: "no-store" }));
  });

  it("authenticates the internal check with the site's own private-test credentials, not the caller's header", async () => {
    for (const [key, value] of Object.entries(privateSite)) vi.stubEnv(key, value);
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => Response.json({ status: "clear" }));
    vi.stubGlobal("fetch", fetchMock);
    // A worker timer carries the worker secret as a Bearer token. The private-site gate does not
    // accept that on the health route, so forwarding it would fail the check for every handoff.
    const handoff = new NextRequest("https://preview.example.test/.netlify/functions/jump-worker-background", { method: "POST", headers: { authorization: "Bearer worker-secret-worker-secret-worker-secret" } });
    await expect(recoveryBoundaryStatus(handoff)).resolves.toBe("clear");
    expect(fetchMock).toHaveBeenCalledWith(new URL("https://preview.example.test/api/health/recovery-boundary"), expect.objectContaining({ headers: expect.objectContaining({ authorization: siteCredentials }) }));
    const browser = new NextRequest("https://preview.example.test/contacts", { headers: { authorization: "Basic from-the-browser" } });
    await recoveryBoundaryStatus(browser);
    expect(fetchMock).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ headers: expect.objectContaining({ authorization: siteCredentials }) }));
    // The check stays on the request's own origin.
    expect(fetchMock.mock.calls.every(([url]) => String(url) === "https://preview.example.test/api/health/recovery-boundary")).toBe(true);
  });

  it("sends no credentials outside private testing or when the private configuration is incomplete", async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => Response.json({ status: "clear" }));
    vi.stubGlobal("fetch", fetchMock);
    await recoveryBoundaryStatus(new NextRequest("https://preview.example.test/contacts", { headers: { authorization: "Basic from-the-browser" } }));
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty("authorization");
    for (const [key, value] of Object.entries({ ...privateSite, PRIVATE_TEST_PASSWORD: "short" })) vi.stubEnv(key, value);
    await recoveryBoundaryStatus(new NextRequest("https://preview.example.test/contacts"));
    expect(fetchMock.mock.calls[1][1]?.headers).not.toHaveProperty("authorization");
  });

  it("bounds the check with an abort signal that is still open when a warm deploy answers", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal;
      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal.aborted).toBe(false);
      return Response.json({ status: "clear" });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(recoveryBoundaryStatus(new NextRequest("http://localhost/contacts"))).resolves.toBe("clear");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); }));
    await expect(recoveryBoundaryStatus(new NextRequest("http://localhost/contacts"))).resolves.toBe("unavailable");
  });

  it.each([
    () => Promise.reject(new Error("offline")),
    () => Promise.resolve(new Response("bad", { status: 500 })),
    () => Promise.resolve(new Response(JSON.stringify({ status: "invented" }), { status: 200 }))
  ])("fails closed for an unavailable or invalid response", async implementation => {
    vi.stubGlobal("fetch", vi.fn(implementation));
    await expect(recoveryBoundaryStatus(new NextRequest("http://localhost/contacts"))).resolves.toBe("unavailable");
  });
});
