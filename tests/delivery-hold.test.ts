import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runAutomaticDeliveries } from "../src/lib/automatic-delivery";
import { reconcileJumps } from "../src/lib/jump-engine";
import { saveJumpDraft } from "../src/lib/jump-drafts";
import { prisma } from "../src/lib/prisma";
import { createBroadcastFixture, type BroadcastFixture } from "./helpers/broadcast-fixture";

describe.sequential("automatic delivery holds drafted follow-ups", () => {
  let fixture: BroadcastFixture;
  let draftedId: string;
  let plainId: string;

  beforeAll(async () => {
    fixture = await createBroadcastFixture("delivery-hold");
    await prisma.contactPhone.create({ data: { contactId: fixture.contactId, phone: "+15550100300", normalized: "+15550100300", isPrimary: true } });
    await prisma.automationPreference.create({ data: { workspaceId: fixture.workspaceId, enabled: true, smsEnabled: true, reviewWindowMinutes: 15 } });
    const draftedMix = await fixture.addBroadcast("Drafted broadcast", -2);
    const plainMix = await fixture.addBroadcast("Plain broadcast", -2);
    await reconcileJumps({ workspaceId: fixture.workspaceId });
    draftedId = (await prisma.jump.findFirstOrThrow({ where: { workspaceId: fixture.workspaceId, mixId: draftedMix, status: "PENDING" } })).id;
    plainId = (await prisma.jump.findFirstOrThrow({ where: { workspaceId: fixture.workspaceId, mixId: plainMix, status: "PENDING" } })).id;
    // Rows written by the pass are eligible only after the review window (15 minutes at least), so back-date creation.
    await prisma.jump.updateMany({ where: { id: { in: [draftedId, plainId] } }, data: { createdAt: new Date(Date.now() - 60 * 60_000) } });
    expect((await saveJumpDraft({ workspaceId: fixture.workspaceId, jumpId: draftedId, family: "TEXT", body: "Hi {{First Name}}, my own words.", revision: null })).ok).toBe(true);
  });
  afterAll(() => fixture.cleanup());

  it("never claims a follow-up that has a draft, and still handles the others", async () => {
    await runAutomaticDeliveries("delivery-hold-test", new Date());
    expect(await prisma.automatedDelivery.count({ where: { jumpId: draftedId } })).toBe(0);
    expect(await prisma.automatedDelivery.count({ where: { jumpId: plainId } })).toBe(1);
    expect((await prisma.jump.findUniqueOrThrow({ where: { id: draftedId } })).status).toBe("PENDING");
  });
});
