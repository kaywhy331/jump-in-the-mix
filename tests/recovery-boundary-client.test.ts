import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { recoveryBoundaryStatus } from "@/lib/recovery-boundary-client";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("recovery boundary client", () => {
  it.each(["clear", "held"] as const)("accepts the bounded %s response from the configured deploy", async status => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(recoveryBoundaryStatus(new NextRequest("https://preview.example.test/contacts"))).resolves.toBe(status);
    expect(fetchMock).toHaveBeenCalledWith(new URL("https://preview.example.test/api/health/recovery-boundary"), expect.objectContaining({ cache: "no-store" }));
  });

  it("forwards private-test authorization only to the same request origin", async () => {
    vi.stubEnv("PRIVATE_TEST_MODE", "true");
    const fetchMock = vi.fn(async () => Response.json({ status: "clear" }));
    vi.stubGlobal("fetch", fetchMock);
    await recoveryBoundaryStatus(new NextRequest("https://preview.example.test/contacts", { headers: { authorization: "Basic controlled" } }));
    expect(fetchMock).toHaveBeenCalledWith(new URL("https://preview.example.test/api/health/recovery-boundary"), expect.objectContaining({ headers: expect.objectContaining({ authorization: "Basic controlled" }) }));
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
