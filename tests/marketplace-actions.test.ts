import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const mocks = vi.hoisted(() => ({ importPortable: vi.fn(), addFromMarketplace: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => ({ workspace: { id: "business", ownerId: "owner" }, user: { id: "owner" }, impersonation: null }), requirePlatformAdmin: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { mocks.redirect(url); throw new Error(`REDIRECT ${url}`); } }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: vi.fn() }));
vi.mock("@/lib/mega-mix-pipeline-service", () => ({ importPortable: mocks.importPortable, createMegaMixPipeline: vi.fn(), deleteMegaMixPipeline: vi.fn(), duplicateMegaMixPipeline: vi.fn(), updateMegaMixPipeline: vi.fn() }));
vi.mock("@/lib/marketplace-service", () => ({ addFromMarketplace: mocks.addFromMarketplace, markReportsSeen: vi.fn(), reportListing: vi.fn(), reviewListing: vi.fn(), shareOnMarketplace: vi.fn(), unshareFromMarketplace: vi.fn() }));

import { importFileAction } from "../src/lib/mega-mix-pipeline-actions";
import { addFromMarketplaceAction } from "../src/lib/marketplace-actions";

const file = JSON.stringify({ format: "jump-in-the-mix", version: 1, kind: "mix", name: "Estimate follow-up", description: null, rules: [], waitingBeats: [], finishes: [],
  mixes: [{ key: "m1", name: "Estimate follow-up", description: null, category: null, industry: null, framework: null, triggerMode: "MANUAL_START", dateType: null,
    steps: [{ key: "b1", name: "Check in", channel: "SMS", dayOffset: 0, sendTimeMinutes: null, anchor: "CALENDAR_DAY", offsetMinutes: null, subject: null, body: "Hi {{First Name}}", script: null, longSms: false, includeOptOut: false, variants: [] }] }] });
const form = (fields: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data; };
const importFile = () => importFileAction({}, form({ file, reviewed: "on", name: "Estimate follow-up" }));
const addShare = () => addFromMarketplaceAction({}, form({ listingId: "listing-1", reviewed: "on", name: "Copy", fingerprint: "abc" }));
// What a duplicate channel-version family in a file produces today.
const prismaError = () => new Prisma.PrismaClientKnownRequestError("Invalid `prisma.stepTemplate.create()` invocation: Unique constraint failed on the fields: (`stepVersionId`,`family`)", { code: "P2002", clientVersion: "test" });

describe("file import and Marketplace add error messages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keep the messages our own code writes, so the owner knows what to change", async () => {
    mocks.importPortable.mockRejectedValue(new Error("You already have a Mega-Mix called “Contractor”. Choose another name."));
    expect(await importFile()).toEqual({ error: "You already have a Mega-Mix called “Contractor”. Choose another name." });
    mocks.addFromMarketplace.mockRejectedValue(new Error("The author just updated this. Review the latest version, then add it."));
    expect(await addShare()).toEqual({ error: "The author just updated this. Review the latest version, then add it." });
    expect(await importFileAction({}, form({ file: "not json", reviewed: "on" }))).toEqual({ error: expect.stringMatching(/not a Jump in the Mix file/) });
  });

  it("replace database and unexpected errors with a plain message", async () => {
    mocks.importPortable.mockRejectedValue(prismaError());
    expect(await importFile()).toEqual({ error: "That file couldn’t be added. Check it and try again." });
    mocks.importPortable.mockRejectedValue(new TypeError("Cannot read properties of undefined (reading 'id')"));
    expect(await importFile()).toEqual({ error: "That file couldn’t be added. Check it and try again." });
    mocks.importPortable.mockRejectedValue("nope");
    expect(await importFile()).toEqual({ error: "That file couldn’t be added. Check it and try again." });
    mocks.addFromMarketplace.mockRejectedValue(prismaError());
    expect(await addShare()).toEqual({ error: "That share couldn’t be added. Try again." });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("still move on to the new Mix or Mega-Mix when the import works", async () => {
    mocks.importPortable.mockResolvedValue({ pipelineId: null, mixIds: ["mix-9"] });
    await expect(importFile()).rejects.toThrow("REDIRECT /mixes/mix-9/edit?imported=1");
    mocks.addFromMarketplace.mockResolvedValue({ pipelineId: "pipe-4", mixIds: ["a", "b"] });
    await expect(addShare()).rejects.toThrow("REDIRECT /mixes/mega?megaMix=pipe-4&imported=1");
  });
});
