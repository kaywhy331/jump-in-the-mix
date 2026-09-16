import { createHmac } from "node:crypto";
import { EncryptJWT, jwtDecrypt } from "jose";
import { env } from "@/lib/env";

export const ADMISSION_DRAFT_COOKIE = "jitm_admission_draft";
export const ADMISSION_DRAFT_SECONDS = 30 * 60;
export type AdmissionDraftFields = {
  accountCeiling: string;
  outstandingCeiling: string;
  collectionPaused: boolean;
  grantsPaused: boolean;
  referralsPaused: boolean;
  redemptionPaused: boolean;
  reason: string;
};
export type AdmissionDraftState = {
  kind: "draft";
  operation: string;
  revision: number;
  fields: AdmissionDraftFields;
} | { kind: "saved"; operation: string; revision: number };

export function admissionOperation(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

function key() {
  if (!env.dataEncryptionKey.trim()) throw new Error("Admission drafts require configured encryption.");
  return createHmac("sha256", env.dataEncryptionKey).update("admission-draft:v1").digest();
}

function binding(sessionId: string, userId: string) {
  return createHmac("sha256", key()).update(JSON.stringify([sessionId, userId])).digest("base64url");
}

// Explicitly allowlist fields: never serialize FormData, a password, or an MFA code.
export function admissionDraftFields(form: FormData): AdmissionDraftFields | null {
  const accountCeiling = String(form.get("accountCeiling") ?? "");
  const outstandingCeiling = String(form.get("outstandingCeiling") ?? "");
  const reason = String(form.get("reason") ?? "");
  if (accountCeiling.length > 32 || outstandingCeiling.length > 32 || reason.length > 500) return null;
  return { accountCeiling, outstandingCeiling, reason,
    collectionPaused: form.get("collectionPaused") === "on", grantsPaused: form.get("grantsPaused") === "on",
    referralsPaused: form.get("referralsPaused") === "on", redemptionPaused: form.get("redemptionPaused") === "on" };
}

export async function sealAdmissionState(state: AdmissionDraftState, sessionId: string, userId: string, now = Date.now()) {
  const common = { kind: state.kind, operation: state.operation, revision: state.revision };
  const fields = state.kind === "draft" ? {
    accountCeiling: state.fields.accountCeiling, outstandingCeiling: state.fields.outstandingCeiling,
    collectionPaused: state.fields.collectionPaused, grantsPaused: state.fields.grantsPaused,
    referralsPaused: state.fields.referralsPaused, redemptionPaused: state.fields.redemptionPaused,
    // Base64 bounds JSON escaping even for a 500-character Unicode/control-character reason.
    reason: Buffer.from(state.fields.reason, "utf8").toString("base64url")
  } : undefined;
  return new EncryptJWT({ ...common, fields, binding: binding(sessionId, userId) })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" }).setIssuer("admission-draft:v1")
    .setIssuedAt(Math.floor(now / 1000)).setExpirationTime(Math.floor(now / 1000) + ADMISSION_DRAFT_SECONDS)
    .encrypt(key());
}

export async function openAdmissionState(token: string | undefined, sessionId: string, userId: string, now = Date.now()): Promise<AdmissionDraftState | null> {
  if (!token || token.length > 3800) return null;
  try {
    const { payload } = await jwtDecrypt(token, key(), { issuer: "admission-draft:v1", keyManagementAlgorithms: ["dir"], contentEncryptionAlgorithms: ["A256GCM"], currentDate: new Date(now), maxTokenAge: ADMISSION_DRAFT_SECONDS });
    if (payload.binding !== binding(sessionId, userId) || !admissionOperation(payload.operation) || !Number.isSafeInteger(payload.revision) || Number(payload.revision) < 0) return null;
    const common = { operation: payload.operation, revision: Number(payload.revision) };
    if (payload.kind === "saved") return { kind: "saved", ...common };
    if (payload.kind !== "draft" || !payload.fields || typeof payload.fields !== "object") return null;
    const f = payload.fields as Record<string, unknown>;
    if (typeof f.accountCeiling !== "string" || f.accountCeiling.length > 32 || typeof f.outstandingCeiling !== "string" || f.outstandingCeiling.length > 32 || typeof f.reason !== "string") return null;
    if (![f.collectionPaused, f.grantsPaused, f.referralsPaused, f.redemptionPaused].every(value => typeof value === "boolean")) return null;
    const reason = Buffer.from(f.reason, "base64url").toString("utf8");
    if (reason.length > 500) return null;
    return { kind: "draft", ...common, fields: { accountCeiling: f.accountCeiling, outstandingCeiling: f.outstandingCeiling, reason,
      collectionPaused: f.collectionPaused as boolean, grantsPaused: f.grantsPaused as boolean,
      referralsPaused: f.referralsPaused as boolean, redemptionPaused: f.redemptionPaused as boolean } };
  } catch { return null; }
}
