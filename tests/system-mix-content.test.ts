import { describe, expect, it } from "vitest";
import { DEFAULT_SYSTEM_MIX, renderSystemMix, validateSystemMixContent } from "../src/lib/system-mix";

describe("System Mix invitation content", () => {
  it("preserves existing wording and replaces names in one pass", () => {
    expect(validateSystemMixContent(DEFAULT_SYSTEM_MIX)).toEqual(DEFAULT_SYSTEM_MIX);
    const message = renderSystemMix(DEFAULT_SYSTEM_MIX, "Alex\r\nBcc: someone", "{{Sender Name}}");
    expect(message.subject).toBe("Alex Bcc: someone invited you to Jump in the Mix");
    expect(message.body).toContain("Hi {{Sender Name}},");
    expect(renderSystemMix(DEFAULT_SYSTEM_MIX, "", "").body).toContain("Hi there,");
  });
  it.each([
    { ...DEFAULT_SYSTEM_MIX, subject: "{{Sender Name}}\r\nBcc: another person" },
    { ...DEFAULT_SYSTEM_MIX, body: DEFAULT_SYSTEM_MIX.body + " {{Private Notes}}" },
    { ...DEFAULT_SYSTEM_MIX, body: DEFAULT_SYSTEM_MIX.body + " {{Access URL}}" },
    { ...DEFAULT_SYSTEM_MIX, body: DEFAULT_SYSTEM_MIX.body + " <script>run()</script>" },
    { ...DEFAULT_SYSTEM_MIX, body: DEFAULT_SYSTEM_MIX.body + " https://example.test/register" },
    { ...DEFAULT_SYSTEM_MIX, body: DEFAULT_SYSTEM_MIX.body + " example.test" },
    { ...DEFAULT_SYSTEM_MIX, body: "A message without either required personal placeholder." },
    { ...DEFAULT_SYSTEM_MIX, body: DEFAULT_SYSTEM_MIX.body + "\u0000" },
    { ...DEFAULT_SYSTEM_MIX, body: DEFAULT_SYSTEM_MIX.body.repeat(20) }
  ])("rejects unsupported copy before a release can be saved", content => {
    expect(() => validateSystemMixContent(content)).toThrow();
  });
});
