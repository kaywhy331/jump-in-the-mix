import { describe, expect, it } from "vitest";
import { requestPublicOrigin, requestPublicUrl } from "../src/lib/request-url";

describe("public request URLs", () => {
  it("prefers forwarded browser host and protocol over the internal listener URL", () => {
    const request = new Request("http://0.0.0.0:3000/api/admin/impersonation/start", {
      headers: {
        host: "internal-app:3000",
        "x-forwarded-host": "app.example.com",
        "x-forwarded-proto": "https"
      }
    });
    expect(requestPublicOrigin(request)).toBe("https://app.example.com");
    expect(requestPublicUrl(request, "/jumps?impersonating=1").toString()).toBe("https://app.example.com/jumps?impersonating=1");
  });

  it("preserves the direct browser Host header during local testing", () => {
    const request = new Request("http://0.0.0.0:3000/api/admin/impersonation/end", {
      headers: { host: "127.0.0.1:3000" }
    });
    expect(requestPublicUrl(request, "/admin/users?impersonationEnded=1").toString())
      .toBe("http://127.0.0.1:3000/admin/users?impersonationEnded=1");
  });
});
