import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { decryptFile, encryptFile, parseBackupKey, readArchiveMetadata, sha256File } from "../scripts/lib/backup-archive.mjs";

const directories = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "jitm-backup-test-"));
  directories.push(directory);
  return {
    directory,
    source: join(directory, "source.dump"),
    archive: join(directory, "backup.jitm-backup.enc"),
    restored: join(directory, "restored.dump")
  };
}

describe("encrypted backup archive", () => {
  it("round-trips data with authenticated AES-256-GCM encryption", async () => {
    const files = await fixture();
    const key = randomBytes(32).toString("hex");
    const payload = Buffer.concat([Buffer.from("Jump in the Mix backup\n"), randomBytes(128 * 1024)]);
    await writeFile(files.source, payload);

    await encryptFile(files.source, files.archive, key);
    const metadata = await readArchiveMetadata(files.archive);
    expect(metadata.algorithm).toBe("aes-256-gcm");
    expect(metadata.ciphertextBytes).toBe(payload.length);
    expect(await sha256File(files.archive)).toMatch(/^[a-f0-9]{64}$/u);

    await decryptFile(files.archive, files.restored, key);
    expect(await readFile(files.restored)).toEqual(payload);
  });

  it("rejects the wrong key and removes the partial output", async () => {
    const files = await fixture();
    await writeFile(files.source, "protected backup");
    await encryptFile(files.source, files.archive, randomBytes(32).toString("hex"));

    await expect(decryptFile(files.archive, files.restored, randomBytes(32).toString("hex"))).rejects.toThrow(/authenticated/u);
    await expect(readFile(files.restored)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("accepts only dedicated 32-byte key material", () => {
    expect(parseBackupKey("00".repeat(32))).toHaveLength(32);
    expect(parseBackupKey(randomBytes(32).toString("base64"))).toHaveLength(32);
    expect(() => parseBackupKey("short-passphrase")).toThrow(/32-byte/u);
    expect(() => parseBackupKey("GENERATE_ME")).toThrow(/configured/u);
  });
});
