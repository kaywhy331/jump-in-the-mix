import { createHash, randomBytes } from "node:crypto";
import { encryptIntegrationCredentials } from "@/lib/integration-crypto";

export function hashConnectionToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function createConnectionToken() {
  const token = randomBytes(32).toString("base64url");
  return { tokenHash: hashConnectionToken(token), tokenEncrypted: encryptIntegrationCredentials(token) };
}
