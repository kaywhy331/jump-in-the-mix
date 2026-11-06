import { describe, expect, it, vi } from "vitest";
import { reportSensitivePush } from "./report-sensitive-push.mjs";
import { settings } from "./flag-sensitive-push.mjs";

function fixture() {
  const issues = [];
  let label = false;
  const api = {
    listForRepo: vi.fn(),
    getLabel: vi.fn(async () => { if (!label) throw { status: 404 }; return { data: {} }; }),
    createLabel: vi.fn(async () => { label = true; return { data: {} }; }),
    create: vi.fn(async (issue) => { const data = { ...issue, number: issues.length + 1 }; issues.push(data); return { data }; }),
  };
  const github = {
    rest: { issues: api },
    paginate: { iterator: vi.fn(async function* () { yield { data: [{ pull_request: {}, body: "unrelated" }] }; yield { data: issues }; }) },
  };
  const context = { repo: { owner: "fixture", repo: "example" }, runId: 42 };
  const report = { before: "a".repeat(40), after: "b".repeat(40), ref: "refs/heads/main", pusher: "fixture", flagged: ["vitest.config.ts"], warnings: [] };
  return { github, context, report, api, issues };
}

describe("one issue per push", () => {
  it("creates the label and issue once, and finds a closed issue on rerun", async () => {
    const f = fixture();
    const first = await reportSensitivePush(f);
    f.issues[0].state = "closed";
    expect(await reportSensitivePush(f)).toEqual(first);
    expect(f.api.create).toHaveBeenCalledTimes(1);
    expect(f.api.createLabel).toHaveBeenCalledTimes(1);
    expect(first.title).toBe("Post-merge audit: bbbbbbb touches sensitive paths");
    expect(first.labels).toEqual([settings.label]);
    for (const value of [f.report.before, f.report.after, f.report.pusher, ...f.report.flagged]) expect(first.body).toContain(value);
    expect(f.github.paginate.iterator).toHaveBeenCalledWith(f.api.listForRepo, expect.objectContaining({ state: "all" }));
  });

  it("creates separate issues for separate pushes to the same SHA", async () => {
    const f = fixture();
    await reportSensitivePush(f);
    await reportSensitivePush({ ...f, context: { ...f.context, runId: 43 } });
    expect(f.api.create).toHaveBeenCalledTimes(2);
    expect(f.api.createLabel).toHaveBeenCalledTimes(1);
  });

  it("makes no API calls for a source-only push", async () => {
    const f = fixture();
    expect(await reportSensitivePush({ ...f, report: { ...f.report, flagged: [] } })).toBeNull();
    expect(f.github.paginate.iterator).not.toHaveBeenCalled();
    expect(f.api.createLabel).not.toHaveBeenCalled();
    expect(f.api.create).not.toHaveBeenCalled();
  });

  it("rechecks a label created concurrently by another push", async () => {
    const f = fixture();
    f.api.getLabel.mockRejectedValueOnce({ status: 404 }).mockResolvedValue({ data: {} });
    f.api.createLabel.mockRejectedValueOnce({ status: 422 });
    await reportSensitivePush(f);
    expect(f.api.getLabel).toHaveBeenCalledTimes(2);
    expect(f.api.create).toHaveBeenCalledTimes(1);
  });
});
