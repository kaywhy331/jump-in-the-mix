import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), transaction: vi.fn(), findMix: vi.fn(), useTemplate: vi.fn(), ensureStarter: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw Object.assign(new Error(path), { digest: "NEXT_REDIRECT" }); } }));
vi.mock("@/lib/env", () => ({ env: { authRateLimitSecret: "mix-error-signing-secret-00000000000001" } }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: mocks.workspace }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction, mix: { findFirst: mocks.findMix }, userPreference: { findUnique: vi.fn() } } }));
vi.mock("@/lib/display-preferences", () => ({ timezoneForUser: async () => "America/New_York" }));
vi.mock("@/lib/mix-workflow", () => ({ readWorkflowDefinition: vi.fn(), saveWorkflowConfiguration: vi.fn() }));
vi.mock("@/lib/marketplace-service", () => ({ unshareForArchivedMix: vi.fn() }));
vi.mock("@/lib/shared-mix-use-service", () => ({ useSharedMixTemplate: mocks.useTemplate }));
vi.mock("@/lib/starter-mix", () => ({ ensureStarterMix: mocks.ensureStarter }));
import { saveMixAction } from "../src/lib/mix-editor-actions";
import { archiveMixAction } from "../src/lib/mix-lifecycle-actions";
import { useSharedMixTemplateAction } from "../src/lib/shared-mix-use-actions";
import { createStarterMixAction } from "../src/lib/starter-mix-actions";
import EditMixPage from "../src/app/(app)/mixes/[mixId]/edit/page";
import { LibraryError } from "../src/lib/library-content";
import { SharedMixContentError } from "../src/lib/shared-mix";
import { UNVERIFIED_ERROR_MESSAGE, viewerErrorMessage } from "../src/lib/form-errors";
import { UserFacingError } from "../src/lib/user-facing-error";

const owner = { authUser: { id: "user-owner" } }, staff = { authUser: { id: "user-staff" } };
/** A Prisma error as the client throws it: its message names the query and the constraint. */
const databaseError = () => Object.assign(new Error("Invalid `prisma.mix.create()` invocation: Unique constraint failed on the fields: (`id`)"), { name: "PrismaClientKnownRequestError", code: "P2002" });
const params = (location: string) => Object.fromEntries(new URL(location, "https://jumpinthemix.com").searchParams);
async function redirectOf(action: Promise<unknown>): Promise<string> {
  try { await action; } catch (error) { if (error instanceof Error && "digest" in error) return error.message; throw error; }
  throw new Error("Expected a redirect");
}
/** The editor's form for a one-Beat draft, as MixEditor posts it. */
const mixForm = (fields: Record<string, string> = {}) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ name: "Estimate follow-up", status: "DRAFT", triggerMode: "MANUAL_START", dayOffset: "0", mixStepId: "", sendTimeMinutes: "", plannedAt: "", anchor: "CALENDAR_DAY", offsetMinutes: "", "inlineName-0": "Check in", "inlineChannel-0": "PHONE_CALL", "inlineScript-0": "Ask about the estimate.", ...fields })) data.set(key, value);
  return data;
};
const setupForm = () => { const data = new FormData(); data.set("sharedMixId", "shared 1"); data.set("status", "DRAFT"); data.set("requestId", "use-request-0001"); return data; };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.workspace.mockResolvedValue({ session: { id: "session-1", ...owner }, user: { id: "user-owner" }, workspace: { id: "workspace-1" }, impersonation: null });
});

describe("Mix editor errors are signed for the person who saved", () => {
  it("keeps a Beat's own wording through the old edit address, for that person only", async () => {
    const location = await redirectOf(saveMixAction(mixForm({ mixId: "mix-1", "variantEmailBody-0": "Here is the estimate." })));
    expect(location).toMatch(/^\/mixes\/mix-1\/edit\?error=.+&at=\d+&sig=[\w-]+$/);
    expect(viewerErrorMessage(params(location), owner)).toBe("Beat 1's email version needs a subject.");
    // /mixes/<id>/edit forwards to the library's editor view; the message must survive the hop.
    const forwarded = await redirectOf(EditMixPage({ params: Promise.resolve({ mixId: "mix-1" }), searchParams: Promise.resolve(params(location)) }));
    expect(forwarded.startsWith("/mixes?mix=mix-1&view=edit&error=")).toBe(true);
    expect(viewerErrorMessage(params(forwarded), owner)).toBe("Beat 1's email version needs a subject.");
    expect(viewerErrorMessage(params(forwarded), staff)).toBe(UNVERIFIED_ERROR_MESSAGE);
  });

  it("signs a support view's refusal for the staff member who sees it, not the customer", async () => {
    mocks.workspace.mockResolvedValue({ session: { id: "session-2", ...staff }, user: { id: "user-owner" }, workspace: { id: "workspace-1" }, impersonation: { id: "support-view" } });
    const location = await redirectOf(saveMixAction(mixForm()));
    expect(viewerErrorMessage(params(location), staff)).toBe("Administrator support sessions are view-only.");
    expect(viewerErrorMessage(params(location), owner)).toBe(UNVERIFIED_ERROR_MESSAGE);
  });

  it("keeps the fixed-date parser's wording", async () => {
    const location = await redirectOf(saveMixAction(mixForm({ triggerMode: "BROADCAST", broadcastDate: "2026-02-30", broadcastTime: "09:00", broadcastTimezone: "UTC" })));
    expect(viewerErrorMessage(params(location), owner)).toBe("Choose a valid Mix start date.");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("keeps refusals written during the save and the Journey's own, and never a database error's text", async () => {
    mocks.transaction.mockImplementation(async (run: (tx: unknown) => Promise<void>) => run({ $queryRaw: vi.fn(), mix: { create: vi.fn() }, mixBroadcastSchedule: { deleteMany: vi.fn() }, stepTemplate: { create: async () => ({ versions: [] }) } }));
    expect(viewerErrorMessage(params(await redirectOf(saveMixAction(mixForm()))), owner)).toBe("Follow-up #1 could not be created.");
    mocks.transaction.mockRejectedValue(new UserFacingError("Journey changed in another window. Reload its latest configuration before saving; your draft has been kept."));
    expect(viewerErrorMessage(params(await redirectOf(saveMixAction(mixForm()))), owner)).toBe("Journey changed in another window. Reload its latest configuration before saving; your draft has been kept.");
    mocks.transaction.mockRejectedValue(databaseError());
    const location = await redirectOf(saveMixAction(mixForm()));
    expect(location.startsWith("/mixes/new?error=")).toBe(true);
    expect(location).not.toMatch(/prisma|constraint/i);
    expect(viewerErrorMessage(params(location), owner)).toBe("The Mix could not be saved.");
  });
});

describe("ready-made Mix, starter and lifecycle errors are signed for the person who acted", () => {
  it("asks for a ready-made mix on the library page", async () => {
    const location = await redirectOf(useSharedMixTemplateAction(new FormData()));
    expect(location.startsWith("/templates?error=")).toBe(true);
    expect(viewerErrorMessage(params(location), owner)).toBe("Choose a ready-made Mix.");
  });

  it.each([
    ["a library refusal", new LibraryError("This Mix changed since your preview. Reload and review it before continuing."), "This Mix changed since your preview. Reload and review it before continuing."],
    ["a content refusal", new SharedMixContentError("Beat 2 does not use a supported channel."), "Beat 2 does not use a supported channel."],
    ["the setup's own plain refusal", new Error("Choose only active tags."), "Choose only active tags."],
    ["an inactive date type", new Error("Turn on the Warranty expires date type before using this Mix."), "Turn on the Warranty expires date type before using this Mix."],
    ["a database error", databaseError(), "The ready-made Mix could not be used."],
    ["an unexpected error", new Error("socket hang up"), "The ready-made Mix could not be used."]
  ])("setting up a ready-made mix shows %s as intended", async (_label, error, shown) => {
    mocks.useTemplate.mockRejectedValue(error);
    const location = await redirectOf(useSharedMixTemplateAction(setupForm()));
    expect(location.startsWith("/templates/shared%201/use?error=")).toBe(true);
    expect(viewerErrorMessage(params(location), owner)).toBe(shown);
  });

  it("shows the starter's fixed sentence for an operator or database failure", async () => {
    mocks.findMix.mockResolvedValue(null);
    for (const error of [new Error("System Follow-up date type is missing. Run the seed command again."), databaseError()]) {
      mocks.ensureStarter.mockRejectedValue(error);
      expect(viewerErrorMessage(params(await redirectOf(createStarterMixAction())), owner)).toBe("The starter Mix could not be created.");
    }
  });

  it("signs a lifecycle refusal on the library", async () => {
    mocks.findMix.mockResolvedValue(null);
    const data = new FormData(); data.set("mixId", "mix-gone");
    const location = await redirectOf(archiveMixAction(data));
    expect(location.startsWith("/mixes?error=")).toBe(true);
    expect(viewerErrorMessage(params(location), owner)).toBe("Mix not found.");
  });
});

describe("the refusal lists match the wording their services throw", () => {
  const read = (path: string) => readFileSync(path, "utf8");
  const listed = (path: string, name: string) => [...read(path).match(new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`))![1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
  it.each([
    ["src/lib/shared-mix-use-actions.ts", "SETUP_REFUSALS", ["src/lib/shared-mix-use-service.ts", "src/lib/mix-broadcast.ts"]]
  ])("%s %s", (path, name, services) => {
    const wording = services.map(read).join("\n"), sentences = listed(path, name);
    expect(sentences.length).toBeGreaterThan(2);
    for (const sentence of sentences) expect(wording, `${sentence} is no longer thrown by ${services.join(", ")}`).toContain(`"${sentence}"`);
  });
  it("src/lib/shared-mix-use-actions.ts INACTIVE_DATE_TYPE", () => {
    expect(read("src/lib/shared-mix-use-service.ts")).toContain("`Turn on the ${existing.name} date type before using this Mix.`");
  });
});
