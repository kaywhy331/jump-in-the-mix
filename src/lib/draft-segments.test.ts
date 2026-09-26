import { describe, expect, it } from "vitest";
import { applyDraftEdit, detachedTokens, draftSource, parseDraftSource, projectDraft, projectDraftSource, type DraftSegment } from "./draft-segments";

const values = { "{{First Name}}": "Alex", "{{Last Name}}": "", "{{SMS Signature}}": "Sam at Reliable Plumbing" };
const template = "Hi {{First Name}} {{Last Name}}, your estimate is ready.\n{{SMS Signature}}";

function edit(segments: DraftSegment[], next: string): DraftSegment[] {
  return applyDraftEdit(segments, projectDraft(segments), next);
}

describe("draft segments", () => {
  it("round-trips a template through projection and source", () => {
    const segments = parseDraftSource(template, values);
    expect(projectDraft(segments)).toBe("Hi Alex , your estimate is ready.\nSam at Reliable Plumbing");
    expect(draftSource(segments)).toBe(template);
    expect(projectDraftSource(template, values)).toBe(projectDraft(segments));
    expect(projectDraftSource(null, values)).toBeNull();
  });

  it("renders unknown tokens as empty, the way the scheduler does, and keeps them as tokens", () => {
    const segments = parseDraftSource("Hi {{contact.custom.plan}}!", values);
    expect(projectDraft(segments)).toBe("Hi !");
    expect(draftSource(segments)).toBe("Hi {{contact.custom.plan}}!");
  });

  it("keeps tokens when literal text around them is edited", () => {
    let segments = parseDraftSource(template, values);
    segments = edit(segments, "Hi Alex , your estimate is ready to review.\nSam at Reliable Plumbing");
    expect(draftSource(segments)).toBe("Hi {{First Name}} {{Last Name}}, your estimate is ready to review.\n{{SMS Signature}}");
    segments = edit(segments, "Hello Alex , your estimate is ready to review.\nSam at Reliable Plumbing");
    expect(draftSource(segments)).toBe("Hello {{First Name}} {{Last Name}}, your estimate is ready to review.\n{{SMS Signature}}");
  });

  it("detaches a token whose rendered value is edited inside its span", () => {
    let segments = parseDraftSource(template, values);
    segments = edit(segments, "Hi Alyx , your estimate is ready.\nSam at Reliable Plumbing");
    expect(draftSource(segments)).toBe("Hi Alyx {{Last Name}}, your estimate is ready.\n{{SMS Signature}}");
    expect(detachedTokens(template, draftSource(segments))).toEqual(["{{First Name}}"]);
  });

  it("keeps a token when text is appended right after it", () => {
    let segments = parseDraftSource(template, values);
    segments = edit(segments, "Hi Alex! , your estimate is ready.\nSam at Reliable Plumbing");
    expect(draftSource(segments)).toBe("Hi {{First Name}}! {{Last Name}}, your estimate is ready.\n{{SMS Signature}}");
  });

  it("does not detach a token when a repeated character is typed beside it", () => {
    let segments = parseDraftSource("Hi {{First Name}}!", values);
    // Typing "A" before "Alex" reads as an insertion inside the token; the boundary position wins.
    segments = edit(segments, "Hi AAlex!");
    expect(draftSource(segments)).toBe("Hi A{{First Name}}!");
    segments = edit(segments, "Hi AAlexx!");
    expect(draftSource(segments)).toBe("Hi A{{First Name}}x!");
  });

  it("collapses a selection that spans a token into literal text", () => {
    let segments = parseDraftSource(template, values);
    segments = edit(segments, "Hi Al, your estimate is ready.\nSam at Reliable Plumbing");
    // The first name was cut into; the empty last name at the edge of the change stays a token.
    expect(draftSource(segments)).toBe("Hi Al{{Last Name}}, your estimate is ready.\n{{SMS Signature}}");
  });

  it("keeps an empty token at the edge of a change", () => {
    let segments = parseDraftSource(template, values);
    segments = edit(segments, "Hi Alex, your estimate is ready.\nSam at Reliable Plumbing");
    // Deleting the space between the name and the empty last name keeps both tokens.
    expect(draftSource(segments)).toBe("Hi {{First Name}}{{Last Name}}, your estimate is ready.\n{{SMS Signature}}");
  });

  it("starts new literal text between two adjacent tokens", () => {
    let segments = parseDraftSource("{{First Name}}{{SMS Signature}}", values);
    segments = edit(segments, "Alex - Sam at Reliable Plumbing");
    expect(draftSource(segments)).toBe("{{First Name}} - {{SMS Signature}}");
  });

  it("handles clearing everything and typing from scratch", () => {
    let segments = parseDraftSource(template, values);
    segments = edit(segments, "");
    expect(segments).toEqual([]);
    segments = edit(segments, "Plain text only");
    expect(draftSource(segments)).toBe("Plain text only");
    expect(projectDraft(segments)).toBe("Plain text only");
  });

  it("returns the same segments for an unchanged projection", () => {
    const segments = parseDraftSource(template, values);
    expect(applyDraftEdit(segments, projectDraft(segments), projectDraft(segments))).toBe(segments);
  });
});
