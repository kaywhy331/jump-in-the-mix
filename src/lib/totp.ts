import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;

function cleanBase32(value: string): string {
  return value.toUpperCase().replace(/[^A-Z2-7]/g, "");
}

export function encodeBase32(value: Uint8Array): string {
  const bits = [...value].map((byte) => byte.toString(2).padStart(8, "0")).join("");
  let output = "";
  for (let index = 0; index < bits.length; index += 5) {
    const chunk = bits.slice(index, index + 5).padEnd(5, "0");
    output += BASE32_ALPHABET[Number.parseInt(chunk, 2)];
  }
  return output;
}

export function decodeBase32(value: string): Buffer {
  const normalized = cleanBase32(value);
  if (!normalized) throw new Error("TOTP secret is empty.");
  let bits = "";
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) throw new Error("TOTP secret contains unsupported characters.");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(byteLength = 20): string {
  return encodeBase32(randomBytes(byteLength));
}

export function totpCounter(at: number | Date = Date.now(), periodSeconds = TOTP_PERIOD_SECONDS): number {
  const milliseconds = at instanceof Date ? at.getTime() : at;
  return Math.floor(milliseconds / 1000 / periodSeconds);
}

export function generateTotpCode(
  secret: string,
  at: number | Date = Date.now(),
  options: { digits?: number; periodSeconds?: number } = {}
): string {
  const digits = options.digits ?? TOTP_DIGITS;
  const periodSeconds = options.periodSeconds ?? TOTP_PERIOD_SECONDS;
  const counter = totpCounter(at, periodSeconds);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(value % (10 ** digits)).padStart(digits, "0");
}

export function verifyTotpCode(
  secret: string,
  candidate: string,
  options: {
    at?: number | Date;
    digits?: number;
    periodSeconds?: number;
    window?: number;
    lastUsedCounter?: number | null;
  } = {}
): number | null {
  const digits = options.digits ?? TOTP_DIGITS;
  const periodSeconds = options.periodSeconds ?? TOTP_PERIOD_SECONDS;
  const window = options.window ?? 1;
  const normalized = candidate.replace(/\s+/g, "");
  if (!new RegExp(`^\\d{${digits}}$`).test(normalized)) return null;

  const currentCounter = totpCounter(options.at ?? Date.now(), periodSeconds);
  const supplied = Buffer.from(normalized, "utf8");
  for (let offset = -window; offset <= window; offset += 1) {
    const counter = currentCounter + offset;
    if (counter < 0 || (options.lastUsedCounter !== null && options.lastUsedCounter !== undefined && counter <= options.lastUsedCounter)) continue;
    const timestamp = counter * periodSeconds * 1000;
    const expected = Buffer.from(generateTotpCode(secret, timestamp, { digits, periodSeconds }), "utf8");
    if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) return counter;
  }
  return null;
}
