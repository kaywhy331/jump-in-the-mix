import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkflowAttention, UpcomingWorkflowCommitments } from "@/components/WorkflowAttention";
import { resolveNextActions } from "@/lib/next-action";
import type { WorkflowAttention as Attention } from "@/lib/workflow-attention";

const displayPreferences = { locale: "en-US", timeZone: "America/Los_Angeles" };
const projection = resolveNextActions([{
  id: "callback", contactId: "person", contactName: "Avery Fixture", kind: "commitment",
  title: "Estimate follow-up", detail: "Check the commitment you saved.", action: "Review commitment",
  href: "/contacts/person", dueAt: "2026-11-07T17:00:00Z", updatedAt: "2026-11-07T17:00:00Z"
}], { now: new Date("2026-11-07T18:00:00Z"), timeZone: displayPreferences.timeZone });
const item = { id: "callback", contactId: "person", contactName: "Avery Fixture", label: "Estimate follow-up", reason: "Check the commitment you saved.", href: "/contacts/person", action: "Review commitment" };

describe("Today input rows", () => {
  it("renders person, action, reason, account time and a destination from the live projection", () => {
    const attention: Attention = { items: [{ ...item, nextAction: projection.items[0] }], total: 1, preparing: false };
    const html = renderToStaticMarkup(<WorkflowAttention attention={attention} projection={projection} displayPreferences={displayPreferences} />);
    expect(html).toContain("<strong>Avery Fixture</strong>");
    expect(html).toContain("Review commitment · Estimate follow-up · Check the commitment you saved.");
    expect(html).toContain("9:00 AM");
    // The label sits in the span a loading view marks as pending (UXA-02).
    expect(html).toMatch(/<a[^>]+href="\/contacts\/person"[^>]*><span class="next-action-link-label">Review commitment<\/span><\/a>/);
  });

  it("keeps the action and reason when the fallback has no verified time", () => {
    const html = renderToStaticMarkup(<WorkflowAttention attention={{ items: [item], total: 1, preparing: false }} />);
    expect(html).toContain("<strong>Avery Fixture</strong>");
    expect(html).toContain("Review commitment · Estimate follow-up");
    expect(html).toContain("Check the commitment you saved.");
    expect(html).toContain("Time not available");
    expect(html).toMatch(/<a[^>]+href="\/contacts\/person"[^>]*>Review commitment<\/a>/);
  });

  it("renders future actions with the commitment's own saved timezone", () => {
    const attention: Attention = { items: [], total: 0, preparing: false, future: [{ ...item, dueAt: "2026-11-08T17:00:00Z", timezone: "America/New_York" }] };
    const html = renderToStaticMarkup(<UpcomingWorkflowCommitments attention={attention} displayPreferences={displayPreferences} />);
    expect(html).toContain("<strong>Avery Fixture</strong>");
    expect(html).toContain("Review commitment · Estimate follow-up");
    expect(html).toContain("Check the commitment you saved.");
    expect(html).toContain("12:00 PM");
    expect(html).toContain("New York time");
    expect(html).toMatch(/<a[^>]+href="\/contacts\/person"[^>]*>Review commitment<\/a>/);
  });
});
