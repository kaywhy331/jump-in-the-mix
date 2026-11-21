import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BROWSER_CHANGE_CHANNEL, BROWSER_CHANGE_KEY, signalBrowserChange } from "../src/lib/private-browser-state";
import { shieldTitle } from "../src/components/BrowserAccountBoundary";

// JITM-UXS-16: the boundary's mount signal must not re-check its own tab (UXD-04: two checks per load, the first cancelled).
let stored: Map<string, string>;
const open: BroadcastChannel[] = [];
function listen() {
  const channel = new BroadcastChannel(BROWSER_CHANGE_CHANNEL), heard: unknown[] = [];
  channel.onmessage = event => heard.push(event.data);
  open.push(channel);
  return { channel, heard };
}
// Messages arrive as tasks, so wait until the other listener has heard one, then one more turn for anything late.
async function delivered(heard: unknown[]) {
  await vi.waitFor(() => expect(heard).toHaveLength(1));
  await new Promise(resolve => setTimeout(resolve, 20));
}
beforeEach(() => {
  stored = new Map();
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) } });
});
afterEach(() => { for (const channel of open.splice(0)) channel.close(); vi.unstubAllGlobals(); });

describe("browser change signal", () => {
  it("sent through the caller's own channel, reaches other listeners but never the caller", async () => {
    const own = listen(), other = listen();
    signalBrowserChange(false, own.channel);
    await delivered(other.heard);
    expect(other.heard).toEqual([expect.objectContaining({ signedOut: false })]);
    expect(own.heard).toEqual([]);
    // The caller's channel stays open for the signals other tabs send.
    signalBrowserChange(true);
    await vi.waitFor(() => expect(own.heard).toEqual([expect.objectContaining({ signedOut: true })]));
    expect(JSON.parse(stored.get(BROWSER_CHANGE_KEY)!)).toMatchObject({ signedOut: true });
  });

  it("without a channel of the caller's, still reaches every listener and marks storage", async () => {
    const first = listen(), second = listen();
    signalBrowserChange(true);
    await delivered(first.heard);
    await vi.waitFor(() => expect(second.heard).toHaveLength(1));
    expect(first.heard[0]).toMatchObject({ signedOut: true, id: expect.any(String) });
    expect(JSON.parse(stored.get(BROWSER_CHANGE_KEY)!)).toEqual(first.heard[0]);
  });

  it("tolerates a closed or missing channel", () => {
    const { channel } = listen(); channel.close();
    expect(() => signalBrowserChange(false, channel)).not.toThrow();
    expect(() => signalBrowserChange(false, null)).not.toThrow();
    expect(stored.has(BROWSER_CHANGE_KEY)).toBe(true);
  });
});

describe("shield tab title", () => {
  it("puts the shield's heading in place of the page's part (JITM-10 §2.22)", () => {
    expect(shieldTitle("Sign in to continue", "Add contact | Jump in the Mix")).toBe("Sign in to continue | Jump in the Mix");
    expect(shieldTitle("Your account changed", "Calendar | Jump in the Mix")).toBe("Your account changed | Jump in the Mix");
    // Only the product part after the last separator is kept.
    expect(shieldTitle("You’re signed out", "Beats | Mix A | Jump in the Mix")).toBe("You’re signed out | Jump in the Mix");
  });

  it("keeps a bare product title as the product part and never leaves an empty title", () => {
    expect(shieldTitle("Reconnect to continue", "Jump in the Mix")).toBe("Reconnect to continue | Jump in the Mix");
    expect(shieldTitle("Checking your account…", "")).toBe("Checking your account…");
  });
});
