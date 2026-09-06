import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { appendFile, mkdir, open, rm, stat } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { dirname } from "node:path";
import { pipeline } from "node:stream/promises";

const MAGIC = Buffer.from("JITMBK01", "ascii");
const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const FIXED_HEADER_BYTES = MAGIC.length + 2;

function sameBuffer(left, right) {
  return left.length === right.length && left.equals(right);
}

async function readExactly(handle, buffer, position) {
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read({
      buffer,
      offset,
      length: buffer.length - offset,
      position: position + offset
    });
    if (!bytesRead) throw new Error("Backup archive ended unexpectedly.");
    offset += bytesRead;
  }
}

export function parseBackupKey(rawValue = process.env.BACKUP_ENCRYPTION_KEY) {
  const value = rawValue?.trim();
  if (!value || value === "GENERATE_ME") {
    throw new Error("BACKUP_ENCRYPTION_KEY must be configured with a dedicated 32-byte key.");
  }

  if (/^[a-f0-9]{64}$/i.test(value)) {
    return Buffer.from(value, "hex");
  }

  if (/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    const decoded = Buffer.from(value, "base64");
    const canonical = decoded.toString("base64").replace(/=+$/u, "");
    const supplied = value.replace(/=+$/u, "");
    if (decoded.length === 32 && canonical === supplied) return decoded;
  }

  throw new Error("BACKUP_ENCRYPTION_KEY must be 64 hexadecimal characters or base64-encoded 32-byte material.");
}

export async function sha256File(path) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

export async function encryptFile(inputPath, outputPath, keyValue = process.env.BACKUP_ENCRYPTION_KEY) {
  const key = Buffer.isBuffer(keyValue) ? keyValue : parseBackupKey(keyValue);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  let ownsOutput = false;

  await mkdir(dirname(outputPath), { recursive: true });
  try {
    const header = Buffer.concat([MAGIC, Buffer.from([VERSION, iv.length]), iv]);
    const output = await open(outputPath, "wx", 0o600);
    ownsOutput = true;
    try { await output.writeFile(header); } finally { await output.close(); }
    await pipeline(createReadStream(inputPath), cipher, createWriteStream(outputPath, { flags: "a" }));
    await appendFile(outputPath, cipher.getAuthTag());
    return {
      version: VERSION,
      algorithm: "aes-256-gcm",
      ivBytes: iv.length,
      tagBytes: TAG_BYTES
    };
  } catch (error) {
    if (ownsOutput) await rm(outputPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function readArchiveMetadata(path) {
  const file = await stat(path);
  if (file.size < FIXED_HEADER_BYTES + IV_BYTES + TAG_BYTES) {
    throw new Error("Backup archive is too small to be a valid Jump in the Mix backup.");
  }

  const handle = await open(path, "r");
  try {
    const fixedHeader = Buffer.alloc(FIXED_HEADER_BYTES);
    await readExactly(handle, fixedHeader, 0);
    const magic = fixedHeader.subarray(0, MAGIC.length);
    if (!sameBuffer(magic, MAGIC)) throw new Error("Backup archive magic header is invalid.");

    const version = fixedHeader[MAGIC.length];
    if (version !== VERSION) throw new Error(`Unsupported backup archive version ${version}.`);

    const ivLength = fixedHeader[MAGIC.length + 1];
    if (ivLength < 8 || ivLength > 32) throw new Error("Backup archive IV length is invalid.");

    const headerBytes = FIXED_HEADER_BYTES + ivLength;
    if (file.size <= headerBytes + TAG_BYTES) throw new Error("Backup archive ciphertext is missing.");

    return {
      version,
      algorithm: "aes-256-gcm",
      ivLength,
      headerBytes,
      tagBytes: TAG_BYTES,
      ciphertextBytes: file.size - headerBytes - TAG_BYTES,
      totalBytes: file.size
    };
  } finally {
    await handle.close();
  }
}

export async function decryptFile(inputPath, outputPath, keyValue = process.env.BACKUP_ENCRYPTION_KEY) {
  const key = Buffer.isBuffer(keyValue) ? keyValue : parseBackupKey(keyValue);
  const metadata = await readArchiveMetadata(inputPath);
  const handle = await open(inputPath, "r");
  const iv = Buffer.alloc(metadata.ivLength);
  const tag = Buffer.alloc(TAG_BYTES);
  try {
    await readExactly(handle, iv, FIXED_HEADER_BYTES);
    await readExactly(handle, tag, metadata.totalBytes - TAG_BYTES);
  } finally {
    await handle.close();
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  await mkdir(dirname(outputPath), { recursive: true });
  let output;
  try {
    output = await open(outputPath, "wx", 0o600);
    await pipeline(
      createReadStream(inputPath, {
        start: metadata.headerBytes,
        end: metadata.totalBytes - TAG_BYTES - 1
      }),
      decipher,
      output.createWriteStream()
    );
    return metadata;
  } catch (error) {
    if (output) {
      await output.close().catch(() => undefined);
      await rm(outputPath, { force: true }).catch(() => undefined);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Backup archive could not be decrypted or authenticated: ${message}`);
  }
}
