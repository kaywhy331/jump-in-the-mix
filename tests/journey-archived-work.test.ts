import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkflowJourney } from "@/components/WorkflowJourney";
import { readWorkflowGraph } from "@/lib/mix-workflow-view";
import { prisma } from "@/lib/prisma";
import { archivedAt, journeyArchivedWorkFixture } from "./helpers/journey-archived-work-fixture";

const local = /^postgres(?:ql)?:\/\/[^@]*@(?:localhost|127\.0\.0\.1):\d+\/jitm_design_/.test(process.env.DATABASE_URL ?? "");
describe.skipIf(!local)("Archived Mix pending follow-ups", () => {
  let f: Awaited<ReturnType<typeof journeyArchivedWorkFixture>>;
  beforeAll(async () => { f = await journeyArchivedWorkFixture(); });
  afterAll(async () => { await f?.cleanup(); await prisma.$disconnect(); });
  const graph = (contactId?: string, node?: string) => readWorkflowGraph(f.workspaceId, { canEdit: true, now: archivedAt, contactId, node });
  const render = async (id: string, contactId?: string) => {
    const html = renderToStaticMarkup(createElement(WorkflowJourney, { initial: await graph(contactId), initialContactId: contactId, displayPreferences: { locale: "en-US", timeZone: "UTC" } }));
    return html.match(new RegExp(`<article[^>]+data-workflow-node="${id}"[^>]*>([\\s\\S]*?)</article>`))?.[1] ?? "";
  };
  it("shows Archived and the exact PENDING Jump count, with one people action", async () => {
    const view = await graph();
    expect(view.mixes.find(m => m.id === f.pending.id)).toMatchObject({ status: "ARCHIVED", pending: 3, completed: 1 });
    const html = await render(f.pending.id);
    expect(html).toContain('data-mix-status="ARCHIVED"');
    expect(html).toContain(">Archived</span>");
    expect(html).toContain(">3 pending follow-ups</span>");
    expect(html.match(/>View people</g)).toHaveLength(1);
    expect(html).not.toContain("people here,");
  });
  it("keeps an archived Mix with ongoing work but no PENDING Jumps marked without a pending count", async () => {
    const html = await render(f.empty.id);
    expect(html).toContain(">Archived</span>");
    expect(html).not.toMatch(/\d+ pending follow-ups/);
    expect(html).not.toContain(">View people</span>");
    expect(html).toContain("people here,");
  });
  it("leaves active Mix population and actions unchanged", async () => {
    const html = await render(f.active.id);
    expect(html).toContain("On · Manual or connected start");
    expect(html).toContain("1 people here, 1 total");
    expect(html).not.toContain("pending follow-up");
    expect(html).not.toContain('data-mix-status="ARCHIVED"');
  });
  it("names person-scoped counts and uses the singular for one", async () => {
    expect(await render(f.pending.id, f.secondId)).toContain(">1 pending follow-up for this person</span>");
  });
  it("never returns a foreign-workspace Mix or its people, even when directly requested", async () => {
    const view = await graph(undefined, `mix:${f.foreignMix.id}`);
    expect(view.mixes.map(m => m.id)).not.toContain(f.foreignMix.id);
    expect(view.analytics.roster).toEqual([]);
    expect(view.mixes.find(m => m.id === f.pending.id)?.pending).toBe(3);
    expect(await render(f.foreignMix.id)).toBe("");
    expect((await prisma.mix.findUniqueOrThrow({ where: { id: f.pending.id } })).status).toBe("ARCHIVED");
  });
});
