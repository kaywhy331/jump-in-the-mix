import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveCaptureDraft, takeCaptureDraft } from "../src/lib/capture-draft";
import { clearPrivateBrowserState, privateStorageKey } from "../src/lib/private-browser-state";
import { inferQuickAddCapture } from "../src/lib/quick-add-capture";
import { todayBriefing } from "../src/lib/today-briefing";

describe("temporary voice and typed capture drafts", () => {
  const data = new Map<string, string>();
  beforeEach(() => {
    data.clear();
    vi.stubGlobal("crypto", { randomUUID });
    vi.stubGlobal("window", { sessionStorage: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key), key: (index: number) => [...data.keys()][index], get length() { return data.size; } } });
  });
  afterEach(() => vi.unstubAllGlobals());
  const draft = inferQuickAddCapture("Email Sam sam@example.test tomorrow about a private estimate", new Date("2026-09-08T18:00:00Z"), "America/Los_Angeles");

  it("returns an opaque ID and consumes the private draft once for its exact account scope", () => {
    const id = saveCaptureDraft("scope-a", draft)!;
    expect(id).toMatch(/^[a-f0-9-]{36}$/);
    expect(takeCaptureDraft("scope-b", id)).toBeNull();
    expect(takeCaptureDraft("scope-a", randomUUID())).toBeNull();
    expect(takeCaptureDraft("scope-a", id)).toEqual(draft);
    expect(takeCaptureDraft("scope-a", id)).toBeNull();
    expect(data.size).toBe(0);
  });
  it("expires, bounds stored drafts and clears them with the existing account boundary", () => {
    const old = saveCaptureDraft("scope-a", draft, 1000)!;
    expect(takeCaptureDraft("scope-a", old, 601_001)).toBeNull();
    const first = saveCaptureDraft("scope-a", draft)!;
    const latest = saveCaptureDraft("scope-a", draft)!;
    expect(data.size).toBe(1); expect(takeCaptureDraft("scope-a", first)).toBeNull();
    clearPrivateBrowserState("scope-b");
    expect(takeCaptureDraft("scope-a", latest)).toBeNull();
  });
  it("rejects malformed records, oversized drafts and unavailable storage without URL fallback", () => {
    expect(saveCaptureDraft(null, draft)).toBeNull();
    expect(saveCaptureDraft("scope-a", { ...draft, original: "x".repeat(2001) })).toBeNull();
    const id = randomUUID();
    data.set(privateStorageKey("scope-a", "capture-draft"), JSON.stringify({ id, expiresAt: Date.now() + 1000, draft: { original: "broken" } }));
    expect(takeCaptureDraft("scope-a", id)).toBeNull(); expect(data.size).toBe(0);
    vi.stubGlobal("window", { get sessionStorage() { throw new Error("Storage disabled"); } });
    expect(saveCaptureDraft("scope-a", draft)).toBeNull(); expect(takeCaptureDraft("scope-a", id)).toBeNull();
  });
  it("interprets relative dates in the configured timezone across midnight and daylight-saving transitions", () => {
    const now = new Date("2026-09-08T05:00:00Z");
    expect(inferQuickAddCapture("Call Sam tomorrow", now, "America/Los_Angeles").dateValue).toBe("2026-09-08");
    expect(inferQuickAddCapture("Call Sam tomorrow", now, "Asia/Tokyo").dateValue).toBe("2026-09-09");
    expect(inferQuickAddCapture("Call Sam tomorrow", new Date("2026-03-08T09:30:00Z"), "America/Los_Angeles").dateValue).toBe("2026-03-09");
  });
});

describe("factual Today briefing", () => {
  it("separates due today, overdue and explicitly recorded completion", () => {
    const text = todayBriefing({ attention: 4, overdue: 3, markedDone: 2, ready: true });
    expect(text).toContain("1 follow-up is due today, and 3 are overdue");
    expect(text).toContain("2 were marked done today");
    expect(text).not.toMatch(/messages sent|received a reply|delivered/i);
  });
  it("does not report being caught up before preparation is ready", () => {
    expect(todayBriefing({ attention: 0, overdue: 0, markedDone: 0, ready: false })).toContain("not ready yet");
    expect(todayBriefing({ attention: 0, overdue: 0, markedDone: 1, ready: true })).toContain("1 was marked done today");
    expect(todayBriefing({ attention: 0, overdue: 0, markedDone: 0, ready: true })).toContain("no open follow-ups due");
  });
});
