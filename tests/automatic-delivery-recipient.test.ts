import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", async original => {
  const mod = await original<typeof import("../src/lib/env")>();
  return { ...mod, env: { ...mod.env, twilioAccountSid: "ACfixture", twilioAuthToken: "fixture-token", twilioFromNumber: "+15550109999" } };
});

import { runAutomaticDeliveries } from "../src/lib/automatic-delivery";
import { reconcileJumps } from "../src/lib/jump-engine";
import { prisma } from "../src/lib/prisma";
import { createBroadcastFixture, type BroadcastFixture } from "./helpers/broadcast-fixture";

// The owner typed the number the way people write it; the row keeps that spelling.
const storedPhone = "(555) 234-5678";
const dialed = "+15552345678";

describe.sequential("automatic text delivery dials the stored number in E.164", () => {
  let fixture: BroadcastFixture;
  let jumpId: string;
  const twilioRequests: URLSearchParams[] = [];

  beforeAll(async () => {
    fixture = await createBroadcastFixture("twilio-recipient");
    await prisma.contactPhone.create({ data: { contactId: fixture.contactId, phone: storedPhone, normalized: "5552345678", isPrimary: true } });
    await prisma.automationPreference.create({ data: { workspaceId: fixture.workspaceId, enabled: true, smsEnabled: true, reviewWindowMinutes: 15 } });
    const mixId = await fixture.addBroadcast("Recipient broadcast", -2);
    await reconcileJumps({ workspaceId: fixture.workspaceId });
    jumpId = (await prisma.jump.findFirstOrThrow({ where: { workspaceId: fixture.workspaceId, mixId, status: "PENDING" } })).id;
    // Rows written by the pass are eligible only after the review window, so back-date creation.
    await prisma.jump.update({ where: { id: jumpId }, data: { createdAt: new Date(Date.now() - 60 * 60_000) } });
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.startsWith("https://api.twilio.com/")) throw new Error(`No provider requests other than Twilio are expected here: ${url}`);
      const params = new URLSearchParams(String(init?.body ?? ""));
      twilioRequests.push(params);
      if (params.get("To") !== dialed) return new Response(JSON.stringify({ message: "Not the fixture number." }), { status: 400, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ sid: "SMfixture" }), { status: 201, headers: { "content-type": "application/json" } });
    }));
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await fixture.cleanup();
  });

  it("sends To in E.164 and still records the recipient as stored", async () => {
    await runAutomaticDeliveries("twilio-recipient-test", new Date());
    const request = twilioRequests.find((params) => params.get("Body")?.includes("Hi Alex"));
    expect(request?.get("To")).toBe(dialed);
    expect(request?.get("From")).toBe("+15550109999");
    expect(await prisma.automatedDelivery.findUnique({ where: { jumpId } })).toMatchObject({ status: "DELIVERED", providerId: "SMfixture", error: null });
    expect(await prisma.jump.findUniqueOrThrow({ where: { id: jumpId } })).toMatchObject({ status: "DONE", completionMethod: "automatic:sms" });
    const activity = await prisma.contactActivity.findFirstOrThrow({ where: { jumpId, kind: "JUMP_OUTCOME" } });
    expect(activity.metadata).toMatchObject({ recipientHash: createHash("sha256").update(storedPhone.trim().toLowerCase(), "utf8").digest("hex") });
  });
});
