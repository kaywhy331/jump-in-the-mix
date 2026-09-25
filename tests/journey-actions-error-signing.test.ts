import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), transaction: vi.fn(), record: vi.fn(), configure: vi.fn(), toggle: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw Object.assign(new Error(path), { digest: "NEXT_REDIRECT" }); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { authRateLimitSecret: "journey-error-signing-secret-0000000001" } }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: mocks.workspace }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction, contactJourney: { updateMany: mocks.toggle } } }));
vi.mock("@/lib/journey", () => ({ enableJourney: vi.fn(), recordJourneyEvent: mocks.record }));
vi.mock("@/lib/journey-configuration", async importOriginal => ({ ...await importOriginal<typeof import("../src/lib/journey-configuration")>(), configureJourneyRule: mocks.configure }));
import { changeContactJourneyAction, saveJourneyRuleAction, saveJourneyStageAction, toggleContactJourneyAction } from "../src/lib/journey-actions";
import { JourneyConfigurationError } from "../src/lib/journey-configuration";
import { UNVERIFIED_ERROR_MESSAGE, viewerErrorMessage } from "../src/lib/form-errors";

const owner = { authUser: { id: "user-owner" } }, someoneElse = { authUser: { id: "user-other" } };
/** A Prisma error as the client throws it: its message names the query and the constraint. */
const databaseError = () => Object.assign(new Error("Invalid `prisma.journeyStage.create()` invocation: Unique constraint failed on the fields: (`workspaceId`,`name`)"), { name: "PrismaClientKnownRequestError", code: "P2002" });
const form = (fields: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data; };
const params = (location: string) => Object.fromEntries(new URL(location, "https://jumpinthemix.com").searchParams);
async function redirectOf(action: Promise<unknown>): Promise<string> {
  try { await action; } catch (error) { if (error instanceof Error && "digest" in error) return error.message; throw error; }
  throw new Error("Expected a redirect");
}
/** Runs the stage transaction against a workspace with these stages. */
const stages = (rows: Array<{ id: string; name: string; isActive?: boolean; position?: number; contacts?: number }>) => mocks.transaction.mockImplementation(async (run: (tx: unknown) => Promise<void>) => run({
  $queryRaw: vi.fn(),
  journeyStage: { findMany: async () => rows.map(row => ({ isActive: true, position: 0, ...row, _count: { contacts: row.contacts ?? 0 } })), update: vi.fn(), create: vi.fn() },
  journeyRule: { updateMany: vi.fn() },
  auditLog: { create: vi.fn() }
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.workspace.mockResolvedValue({ session: { id: "session-1", ...owner }, user: { id: "user-owner" }, workspace: { id: "workspace-1" }, impersonation: null });
});

describe("Journey error messages are signed for the person who caused them", () => {
  it("keeps this module's refusals in their own words, for that person only", async () => {
    stages([{ id: "stage-1", name: "New" }]);
    const location = await redirectOf(saveJourneyStageAction(form({ stageId: "stage-1", intent: "archive" })));
    expect(location).toMatch(/^\/settings\/journey\?error=.+&at=\d+&sig=[\w-]+$/);
    expect(viewerErrorMessage(params(location), owner)).toBe("Keep at least one stage.");
    expect(viewerErrorMessage(params(location), someoneElse)).toBe(UNVERIFIED_ERROR_MESSAGE);
    mocks.toggle.mockResolvedValue({ count: 0 });
    const stale = await redirectOf(toggleContactJourneyAction(form({ contactId: "contact 1", version: "3", automatic: "false" })));
    expect(stale.startsWith("/contacts/contact%201?error=")).toBe(true);
    expect(viewerErrorMessage(params(stale), owner)).toBe("The stage changed. Refresh before trying again.");
  });

  it("keeps the Journey service's refusals, which it throws as plain errors", async () => {
    mocks.record.mockRejectedValue(new Error("This customer’s stage changed. Refresh before trying again."));
    const location = await redirectOf(changeContactJourneyAction(form({ contactId: "contact-1", stageId: "stage-2", version: "1", requestId: "request-1" })));
    expect(viewerErrorMessage(params(location), owner)).toBe("This customer’s stage changed. Refresh before trying again.");
    const milestone = await redirectOf(changeContactJourneyAction(form({ contactId: "contact-1", eventType: "TIME_IN_STAGE" })));
    expect(viewerErrorMessage(params(milestone), owner)).toBe("Choose a business milestone.");
  });

  it("never puts a database or network error's text into the address", async () => {
    mocks.transaction.mockRejectedValue(databaseError());
    const stage = await redirectOf(saveJourneyStageAction(form({ name: "Proposal" })));
    expect(stage).not.toMatch(/prisma|constraint/i);
    expect(viewerErrorMessage(params(stage), owner)).toBe("The change could not be saved.");
    mocks.record.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:5432"));
    const contact = await redirectOf(changeContactJourneyAction(form({ contactId: "contact-1", stageId: "stage-2" })));
    expect(contact).not.toContain("ECONNREFUSED");
    expect(viewerErrorMessage(params(contact), owner)).toBe("The change could not be saved.");
  });

  it("signs a refused rule on the stage's address and keeps the saved address as it was", async () => {
    mocks.configure.mockRejectedValue(new JourneyConfigurationError("Choose a different destination stage."));
    const refused = await redirectOf(saveJourneyRuleAction(form({ fromStageId: "stage-1", toStageId: "stage-1", eventType: "SALE_CONFIRMED" })));
    expect(refused).toMatch(/^\/settings\/journey\?stage=stage-1&error=.+&at=\d+&sig=[\w-]+#stage-stage-1$/);
    expect(viewerErrorMessage(params(refused), owner)).toBe("Choose a different destination stage.");
    mocks.configure.mockRejectedValue(databaseError());
    expect(viewerErrorMessage(params(await redirectOf(saveJourneyRuleAction(form({ fromStageId: "stage-1" })))), owner)).toBe("This rule could not be saved. Your entries are kept. Try again.");
    mocks.configure.mockResolvedValue(undefined);
    expect(await redirectOf(saveJourneyRuleAction(form({ fromStageId: "stage-1", toStageId: "stage-2", eventType: "SALE_CONFIRMED" })))).toBe("/settings/journey?saved=1&stage=stage-1#stage-stage-1");
    expect(mocks.workspace).toHaveBeenCalledTimes(3);
  });
});
