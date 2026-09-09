import { createHmac, timingSafeEqual } from "node:crypto";
import { parseBackupKey } from "./backup-archive.mjs";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function tag(manifest, key) {
  const { authentication: _, ...payload } = JSON.parse(JSON.stringify(manifest));
  const signingKey = createHmac("sha256", parseBackupKey(key)).update("jitm.backup.manifest.v1").digest();
  return createHmac("sha256", signingKey).update(canonical(payload)).digest();
}
export function authenticateBackupManifest(manifest, key) {
  return { version: 1, algorithm: "hmac-sha256", tag: tag(manifest, key).toString("hex") };
}
export function verifyBackupManifestAuthentication(manifest, key) {
  // Legacy archives remain readable, but cannot establish source identity for
  // a recovery release. Removing a tag never converts it to trusted evidence.
  if (!Object.hasOwn(manifest, "authentication")) return false;
  const auth = manifest.authentication;
  if (!auth || auth.version !== 1 || auth.algorithm !== "hmac-sha256" || !/^[a-f0-9]{64}$/.test(auth.tag ?? "") || !timingSafeEqual(Buffer.from(auth.tag, "hex"), tag(manifest, key))) throw new Error("Backup manifest could not be authenticated.");
  return true;
}
