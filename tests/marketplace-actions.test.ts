import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { UserFacingError } from "@/lib/user-facing-error";

const mocks = vi.hoisted(() => ({ importPortable: vi.fn(), addFromMarketplace: vi.fn(), redirect: vi.fn(), consumeRateLimit: vi.fn(), requestListingReview: vi.fn(), reviewListing: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: async () => ({ workspace: { id: "business", ownerId: "owner" }, user: { id: "owner" }, impersonation: null }), requirePlatformAdmin: async () => ({ user: { id: "staff" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { mocks.redirect(url); throw new Error(`REDIRECT ${url}`); } }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit: mocks.consumeRateLimit }));
vi.mock("@/lib/mega-mix-pipeline-service", () => ({ importPortable: mocks.importPortable, createMegaMixPipeline: vi.fn(), deleteMegaMixPipeline: vi.fn(), duplicateMegaMixPipeline: vi.fn(), updateMegaMixPipeline: vi.fn() }));
vi.mock("@/lib/marketplace-service", () => ({ addFromMarketplace: mocks.addFromMarketplace, markReportsSeen: vi.fn(), reportListing: vi.fn(), requestListingReview: mocks.requestListingReview, reviewListing: mocks.reviewListing, shareOnMarketplace: vi.fn(), unshareFromMarketplace: vi.fn() }));

import { importFileAction } from "../src/lib/mega-mix-pipeline-actions";
import { addFromMarketplaceAction, requestReviewAction, reviewListingAction } from "../src/lib/marketplace-actions";

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
    mocks.importPortable.mockRejectedValue(new UserFacingError("You already have a Mega-Mix called “Contractor”. Choose another name."));
    expect(await importFile()).toEqual({ error: "You already have a Mega-Mix called “Contractor”. Choose another name." });
    mocks.addFromMarketplace.mockRejectedValue(new UserFacingError("The author just updated this. Review the latest version, then add it."));
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
    // A driver or library error is a plain Error too; only UserFacingError wording is ours.
    mocks.addFromMarketplace.mockRejectedValue(new Error("terminating connection due to administrator command"));
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

describe("asking for another review and deciding on it", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 4, retryAfterSeconds: 0 }); });
  const ask = (note: string) => requestReviewAction({}, form({ listingId: "listing-1", note }));

  it("sends the request with the cleaned note and returns to the share", async () => {
    await expect(ask("  I removed   the name from Beat 2. ")).rejects.toThrow("REDIRECT /marketplace?section=mine&item=listing%3Alisting-1&review=requested");
    expect(mocks.requestListingReview).toHaveBeenCalledWith({ workspaceId: "business", actorUserId: "owner", listingId: "listing-1", note: "I removed the name from Beat 2." });
    expect(mocks.consumeRateLimit).toHaveBeenCalledWith(expect.objectContaining({ scope: "marketplace.review-request", identifiers: ["business", "owner"], limit: 5 }));
  });

  it("refuses a note with contact details before it costs an attempt", async () => {
    expect(await ask("Call me on 555 201 4477")).toEqual({ error: "Leave email addresses, phone numbers and links out of the note. Our team can already read your share." });
    expect(mocks.consumeRateLimit).not.toHaveBeenCalled();
    expect(mocks.requestListingReview).not.toHaveBeenCalled();
  });

  it("is rate limited, and shows the reason a request is refused", async () => {
    mocks.consumeRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    expect(await ask("")).toEqual({ error: "You’ve asked for several reviews today. Try again tomorrow, or contact support." });
    expect(mocks.requestListingReview).not.toHaveBeenCalled();
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 3, retryAfterSeconds: 0 });
    mocks.requestListingReview.mockRejectedValue(new UserFacingError("Change the wording first. Another review looks at what you changed since our team’s decision."));
    expect(await ask("")).toEqual({ error: "Change the wording first. Another review looks at what you changed since our team’s decision." });
    mocks.requestListingReview.mockRejectedValue(prismaError());
    expect(await ask("")).toEqual({ error: "Your request could not be sent. Try again." });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("passes the wording staff read with their decision", async () => {
    const decide = (fields: Record<string, string>) => reviewListingAction({}, form({ listingId: "listing-1", decision: "RESTORE", note: "Fixed.", ...fields }));
    await expect(decide({ fingerprint: "abc" })).rejects.toThrow("REDIRECT /admin/marketplace?reviewed=1");
    expect(mocks.reviewListing).toHaveBeenLastCalledWith({ listingId: "listing-1", staffUserId: "staff", decision: "RESTORE", note: "Fixed.", expectedFingerprint: "abc" });
    // A share with nothing to show sends an empty fingerprint; a form without the field sends none.
    await expect(decide({ fingerprint: "" })).rejects.toThrow("REDIRECT");
    expect(mocks.reviewListing).toHaveBeenLastCalledWith(expect.objectContaining({ expectedFingerprint: "" }));
    await expect(decide({})).rejects.toThrow("REDIRECT");
    expect(mocks.reviewListing).toHaveBeenLastCalledWith(expect.objectContaining({ expectedFingerprint: undefined }));
    mocks.reviewListing.mockRejectedValue(new UserFacingError("The author changed this share after you opened it. Read the latest wording, then decide."));
    expect(await decide({ fingerprint: "stale" })).toEqual({ error: "The author changed this share after you opened it. Read the latest wording, then decide." });
  });
});
