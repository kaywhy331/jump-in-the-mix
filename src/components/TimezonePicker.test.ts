import { describe, expect, it } from "vitest";
import { usableDetectedTimezone } from "./TimezonePicker";

describe("device timezone detection", () => {
  it("accepts a real zone the browser reports", () => {
    expect(usableDetectedTimezone("America/Denver")).toBe("America/Denver");
    expect(usableDetectedTimezone("Europe/London")).toBe("Europe/London");
  });

  it("ignores the placeholders a browser reports when it cannot tell where the device is", () => {
    expect(usableDetectedTimezone("UTC")).toBeNull();
    expect(usableDetectedTimezone("Etc/Unknown")).toBeNull();
  });

  it("ignores missing or unsupported zones", () => {
    expect(usableDetectedTimezone(undefined)).toBeNull();
    expect(usableDetectedTimezone(null)).toBeNull();
    expect(usableDetectedTimezone("")).toBeNull();
    expect(usableDetectedTimezone("Mars/Olympus_Mons")).toBeNull();
  });
});
