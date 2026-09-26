import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", async original => {
  const mod = await original<typeof import("../src/lib/env")>();
  return { ...mod, env: { ...mod.env, twilioAccountSid: "ACfixture", twilioAuthToken: "fixture-token", twilioFromNumber: "+15550109999" } };
});

import { UNDIALABLE_PHONE_ERROR, runAutomaticDeliveries } from "../src/lib/automatic-delivery";
import { reconcileJumps } from "../src/lib/jump-engine";
import { prisma } from "../src/lib/prisma";
import { createBroadcastFixture, type BroadcastFixture } from "./helpers/broadcast-fixture";

// The owner typed the number the way people write it; the row keeps that spelling.
const storedPhone = "(555) 234-5678";
const dialed = "+15552345678";

type Case = { fixture: BroadcastFixture; jumpId: string };

/** One workspace with automatic texts on, one contact phone saved as given, and one due text follow-up. */
async function textCase(prefix: string, phone: { phone: string; normalized: string }, phoneRegion?: string): Promise<Case> {
  const fixture = await createBroadcastFixture(prefix);
  await prisma.contactPhone.create({ data: { contactId: fixture.contactId, ...phone, isPrimary: true } });
  // No quiet hours, so the case does not depend on the time of day the suite runs.
  if (phoneRegion) await prisma.workspacePreference.create({ data: { workspaceId: fixture.workspaceId, phoneRegion, quietHoursStart: 0, quietHoursEnd: 0 } });
  await prisma.automationPreference.create({ data: { workspaceId: fixture.workspaceId, enabled: true, smsEnabled: true, reviewWindowMinutes: 15 } });
  const mixId = await fixture.addBroadcast(`${prefix} broadcast`, -2);
  await reconcileJumps({ workspaceId: fixture.workspaceId });
  const jumpId = (await prisma.jump.findFirstOrThrow({ where: { workspaceId: fixture.workspaceId, mixId, status: "PENDING" } })).id;
  // Rows written by the pass are eligible only after the review window, so back-date creation.
  await prisma.jump.update({ where: { id: jumpId }, data: { createdAt: new Date(Date.now() - 60 * 60_000) } });
  return { fixture, jumpId };
}

describe.sequential("automatic text delivery dials the stored number in E.164", () => {
  let legacy: Case;
  let swept: Case;
  let regional: Case;
  let local: Case;
  const twilioRequests: URLSearchParams[] = [];

  beforeAll(async () => {
    // Saved before the phone-key change (format-based key): read the way the sweep will read it.
    legacy = await textCase("twilio-recipient", { phone: storedPhone, normalized: "5552345678" });
    // Swept: the canonical key, with an extension that is never dialed.
    swept = await textCase("twilio-swept", { phone: "(555) 234-5679 x12", normalized: "+15552345679;ext=12" });
    // A UK workspace: a national number without a country code is read as a UK number.
    regional = await textCase("twilio-region", { phone: "07911 123456", normalized: "07911123456" }, "GB");
    // A 7-digit local number has no full international form: nothing is sent on a guess.
    local = await textCase("twilio-local", { phone: "555-0142", normalized: "5550142" });
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (!url.startsWith("https://api.twilio.com/")) throw new Error(`No provider requests other than Twilio are expected here: ${url}`);
      const params = new URLSearchParams(String(init?.body ?? ""));
      twilioRequests.push(params);
      if (!/^\+[1-9]\d{7,14}$/.test(params.get("To") ?? "")) return new Response(JSON.stringify({ message: "Not an E.164 number." }), { status: 400, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ sid: `SM${params.get("To")!.slice(1)}` }), { status: 201, headers: { "content-type": "application/json" } });
    }));
    await runAutomaticDeliveries("twilio-recipient-test", new Date());
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    for (const item of [legacy, swept, regional, local]) await item?.fixture.cleanup();
  });

  const sentTo = (to: string) => twilioRequests.filter((params) => params.get("To") === to);

  it("sends To in E.164 and still records the recipient as stored", async () => {
    const request = sentTo(dialed).find((params) => params.get("Body")?.includes("Hi Alex"));
    expect(request?.get("To")).toBe(dialed);
    expect(request?.get("From")).toBe("+15550109999");
    expect(await prisma.automatedDelivery.findUnique({ where: { jumpId: legacy.jumpId } })).toMatchObject({ status: "DELIVERED", providerId: "SM15552345678", error: null });
    expect(await prisma.jump.findUniqueOrThrow({ where: { id: legacy.jumpId } })).toMatchObject({ status: "DONE", completionMethod: "automatic:sms" });
    const activity = await prisma.contactActivity.findFirstOrThrow({ where: { jumpId: legacy.jumpId, kind: "JUMP_OUTCOME" } });
    expect(activity.metadata).toMatchObject({ recipientHash: createHash("sha256").update(storedPhone.trim().toLowerCase(), "utf8").digest("hex") });
  });

  it("texts a swept row's canonical key without its extension", async () => {
    expect(sentTo("+15552345679")).toHaveLength(1);
    expect(await prisma.automatedDelivery.findUnique({ where: { jumpId: swept.jumpId } })).toMatchObject({ status: "DELIVERED", providerId: "SM15552345679" });
  });

  it("reads a number saved without a country code in the workspace's region", async () => {
    expect(sentTo("+447911123456")).toHaveLength(1);
    expect(await prisma.automatedDelivery.findUnique({ where: { jumpId: regional.jumpId } })).toMatchObject({ status: "DELIVERED", providerId: "SM447911123456" });
  });

  it("never sends a number that has no full international form, and says why", async () => {
    expect(twilioRequests.some((params) => ["5550142", "555-0142", "+15550142"].includes(params.get("To") ?? ""))).toBe(false);
    expect(await prisma.automatedDelivery.findUnique({ where: { jumpId: local.jumpId } })).toMatchObject({ status: "FAILED", providerId: null, error: UNDIALABLE_PHONE_ERROR });
    expect(await prisma.jump.findUniqueOrThrow({ where: { id: local.jumpId } })).toMatchObject({ status: "PENDING" });
  });
});
