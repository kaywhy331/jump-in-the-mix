import { afterEach, describe, expect, it, vi } from "vitest";
import { isFollowUpDone, isFollowUpDue, setFollowUpDue, subscribeFollowUpDue } from "@/components/useFollowUpDue";

describe("whether each follow-up on Today is still due (D71)", () => {
  afterEach(() => { for (const jumpId of ["text", "call"]) setFollowUpDue(jumpId, null); });

  it("counts a follow-up with no card on the page as due", () => {
    expect(isFollowUpDue("text")).toBe(true);
  });

  it("follows each card's state, and forgets a card that leaves the page", () => {
    setFollowUpDue("text", false);
    expect(isFollowUpDue("text")).toBe(false);
    expect(isFollowUpDue("call")).toBe(true);
    setFollowUpDue("text", true);
    expect(isFollowUpDue("text")).toBe(true);
    setFollowUpDue("text", false);
    setFollowUpDue("text", null);
    expect(isFollowUpDue("text")).toBe(true);
  });

  it("tells listeners about changes only, until they stop listening", () => {
    const listener = vi.fn();
    const stop = subscribeFollowUpDue(listener);
    setFollowUpDue("text", true);
    setFollowUpDue("text", true);
    expect(listener).toHaveBeenCalledTimes(1);
    setFollowUpDue("call", null);
    expect(listener).toHaveBeenCalledTimes(1);
    setFollowUpDue("text", null);
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    setFollowUpDue("text", false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("remembers a follow-up recorded as done, not one skipped, until Undo or the card leaves (D98)", () => {
    const listener = vi.fn();
    const stop = subscribeFollowUpDue(listener);
    setFollowUpDue("call", false, true);
    expect([isFollowUpDue("call"), isFollowUpDone("call")]).toEqual([false, true]);
    setFollowUpDue("text", false);
    expect(isFollowUpDone("text")).toBe(false);
    // Turning a skip into a done, with the card still not due, is a change listeners hear about.
    listener.mockClear();
    setFollowUpDue("text", false, true);
    expect([isFollowUpDone("text"), listener.mock.calls.length]).toEqual([true, 1]);
    setFollowUpDue("call", true);
    expect(isFollowUpDone("call")).toBe(false);
    setFollowUpDue("text", null);
    expect(isFollowUpDone("text")).toBe(false);
    stop();
  });
});
