import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const VERSION = 1;

type CipherEnvelope = {
  v: number;
  iv: string;
  tag: string;
  data: string;
};

function keyFromSecret(secret: string): Buffer {
  if (!secret.trim()) throw new Error("DATA_ENCRYPTION_KEY is required before connecting external accounts.");
  return createHash("sha256").update(secret, "utf8").digest();
}

function encode(value: Buffer): string {
  return value.toString("base64url");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export function integrationEncryptionConfigured(): boolean {
  return Boolean(env.dataEncryptionKey.trim());
}

export function encryptWithSecret(value: unknown, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, keyFromSecret(secret), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope: CipherEnvelope = {
    v: VERSION,
    iv: encode(iv),
    tag: encode(cipher.getAuthTag()),
    data: encode(ciphertext)
  };
  return JSON.stringify(envelope);
}

export function decryptWithSecret<T>(ciphertext: string, secret: string): T {
  let envelope: CipherEnvelope;
  try {
    envelope = JSON.parse(ciphertext) as CipherEnvelope;
  } catch {
    throw new Error("The stored integration credentials are not valid encrypted data.");
  }
  if (envelope.v !== VERSION || !envelope.iv || !envelope.tag || !envelope.data) {
    throw new Error("The stored integration credential format is unsupported.");
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, keyFromSecret(secret), decode(envelope.iv));
    decipher.setAuthTag(decode(envelope.tag));
    const plaintext = Buffer.concat([decipher.update(decode(envelope.data)), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch {
    throw new Error("The stored integration credentials could not be decrypted.");
  }
}

export function encryptIntegrationCredentials(value: unknown): string {
  return encryptWithSecret(value, env.dataEncryptionKey);
}

export function decryptIntegrationCredentials<T>(ciphertext: string): T {
  return decryptWithSecret<T>(ciphertext, env.dataEncryptionKey);
}
