import { afterEach, describe, expect, it, vi } from "vitest";
import { isFollowUpDue, setFollowUpDue, subscribeFollowUpDue } from "@/components/useFollowUpDue";

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
});
