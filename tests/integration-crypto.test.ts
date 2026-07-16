import { describe, expect, it } from "vitest";
import { decryptWithSecret, encryptWithSecret } from "../src/lib/integration-crypto";

describe("integration credential encryption", () => {
  const secret = "test-encryption-key-with-sufficient-entropy";

  it("round-trips structured credentials without exposing plaintext", () => {
    const credentials = {
      accessToken: "access-token-value",
      refreshToken: "refresh-token-value",
      expiresAt: "2026-07-17T00:00:00.000Z"
    };
    const ciphertext = encryptWithSecret(credentials, secret);

    expect(ciphertext).not.toContain(credentials.accessToken);
    expect(ciphertext).not.toContain(credentials.refreshToken);
    expect(decryptWithSecret<typeof credentials>(ciphertext, secret)).toEqual(credentials);
  });

  it("uses a unique authenticated envelope for the same plaintext", () => {
    const first = encryptWithSecret({ token: "same" }, secret);
    const second = encryptWithSecret({ token: "same" }, secret);

    expect(first).not.toBe(second);
    expect(decryptWithSecret(first, secret)).toEqual({ token: "same" });
    expect(decryptWithSecret(second, secret)).toEqual({ token: "same" });
  });

  it("rejects a wrong key or a modified authentication tag", () => {
    const ciphertext = encryptWithSecret({ refreshToken: "secret" }, secret);
    expect(() => decryptWithSecret(ciphertext, "another-key")).toThrow(/could not be decrypted/i);

    const envelope = JSON.parse(ciphertext) as { v: number; iv: string; tag: string; data: string };
    envelope.tag = `${envelope.tag.slice(0, -1)}${envelope.tag.endsWith("A") ? "B" : "A"}`;
    expect(() => decryptWithSecret(JSON.stringify(envelope), secret)).toThrow(/could not be decrypted/i);
  });

  it("requires an encryption secret", () => {
    expect(() => encryptWithSecret({ token: "value" }, "")).toThrow(/DATA_ENCRYPTION_KEY/i);
  });
});
