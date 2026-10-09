import { afterEach, describe, expect, it, vi } from "vitest";
import { sendsByItself } from "../src/lib/automatic-delivery";

describe("sendsByItself (ENG-01)", () => {
  afterEach(() => vi.unstubAllEnvs());
  const on = { enabled: true, emailEnabled: true, smsEnabled: true };
  it("needs the account's automatic sending and the channel's switch", () => {
    expect(sendsByItself(null, "SMS")).toBe(false);
    expect(sendsByItself({ ...on, enabled: false }, "SMS")).toBe(false);
    expect(sendsByItself({ ...on, smsEnabled: false }, "SMS")).toBe(false);
    expect(sendsByItself(on, "SMS")).toBe(true);
    expect(sendsByItself(on, "PHONE_CALL")).toBe(false);
  });
  it("sends email only while the deployment's automatic customer email is on", () => {
    vi.stubEnv("AUTOMATIC_CUSTOMER_EMAIL", "false");
    expect(sendsByItself(on, "EMAIL")).toBe(false);
  });
});
