import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireWorkspace: vi.fn(), exportSingleMix: vi.fn(), exportMegaMixPipeline: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireWorkspace: mocks.requireWorkspace }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/mega-mix-pipeline-service", () => ({ exportSingleMix: mocks.exportSingleMix, exportMegaMixPipeline: mocks.exportMegaMixPipeline }));

import { GET as exportMix } from "../src/app/api/mixes/[mixId]/export/route";
import { GET as exportMegaMix } from "../src/app/api/mega-mixes/[pipelineId]/export/route";

const pack = { format: "jump-in-the-mix", version: 1, kind: "mix", name: "Estimate follow-up", description: null, mixes: [], rules: [], waitingBeats: [], finishes: [] };
const session = (impersonation: object | null = null) => ({ workspace: { id: "business" }, user: { id: "owner" }, impersonation });
const mixRequest = () => exportMix(new Request("https://example.test/api/mixes/mix-1/export"), { params: Promise.resolve({ mixId: "mix-1" }) });
const megaRequest = () => exportMegaMix(new Request("https://example.test/api/mega-mixes/pipe-1/export"), { params: Promise.resolve({ pipelineId: "pipe-1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exportSingleMix.mockResolvedValue({ package: pack });
  mocks.exportMegaMixPipeline.mockResolvedValue({ package: { ...pack, kind: "mega-mix", name: "Kitchen remodels" }, skippedMixes: 0 });
});

describe("Mix and Mega-Mix file downloads", () => {
  it("send the owner's own file as an attachment that is never cached", async () => {
    mocks.requireWorkspace.mockResolvedValue(session());
    const mix = await mixRequest();
    expect(mix.status).toBe(200);
    expect(mix.headers.get("Content-Disposition")).toBe('attachment; filename="estimate-follow-up.mix.json"');
    expect(mix.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.exportSingleMix).toHaveBeenCalledWith(expect.anything(), "business", "mix-1");
    const mega = await megaRequest();
    expect(mega.status).toBe(200);
    expect(mega.headers.get("Content-Disposition")).toBe('attachment; filename="kitchen-remodels.megamix.json"');
    expect(mocks.exportMegaMixPipeline).toHaveBeenCalledWith(expect.anything(), "business", "pipe-1");
  });

  it("refuse a support view-only session before reading anything", async () => {
    mocks.requireWorkspace.mockResolvedValue(session({ id: "view-1", actorUserId: "agent", targetUserId: "owner" }));
    for (const response of [await mixRequest(), await megaRequest()]) {
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "Support sessions are view-only." });
    }
    expect(mocks.exportSingleMix).not.toHaveBeenCalled();
    expect(mocks.exportMegaMixPipeline).not.toHaveBeenCalled();
  });

  it("answer 404 with the reason when the Mix or Mega-Mix cannot be exported", async () => {
    mocks.requireWorkspace.mockResolvedValue(session());
    mocks.exportSingleMix.mockRejectedValue(new Error("Only an active or draft Mix with Beats and a manual or date start can be exported."));
    const response = await mixRequest();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Only an active or draft Mix with Beats and a manual or date start can be exported." });
  });
});
