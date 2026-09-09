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

  it("preserves an existing archive when its output filename is reused", async () => {
    const files = await fixture();
    const key = randomBytes(32).toString("hex");
    await writeFile(files.source, "first recoverable backup");
    await encryptFile(files.source, files.archive, key);
    const original = await readFile(files.archive);
    await writeFile(files.source, "later data");
    await expect(encryptFile(files.source, files.archive, key)).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(files.archive)).toEqual(original);
    await decryptFile(files.archive, files.restored, key);
    expect(await readFile(files.restored, "utf8")).toBe("first recoverable backup");
  });

  it("preserves an existing restore output when exclusive creation fails", async () => {
    const files = await fixture();
    const key = randomBytes(32).toString("hex");
    await writeFile(files.source, "encrypted data");
    await encryptFile(files.source, files.archive, key);
    await writeFile(files.restored, "do not delete this existing dump");
    await expect(decryptFile(files.archive, files.restored, key)).rejects.toThrow(/EEXIST/u);
    expect(await readFile(files.restored, "utf8")).toBe("do not delete this existing dump");
  });

  it("accepts only dedicated 32-byte key material", () => {
    expect(parseBackupKey("00".repeat(32))).toHaveLength(32);
    expect(parseBackupKey(randomBytes(32).toString("base64"))).toHaveLength(32);
    expect(() => parseBackupKey("short-passphrase")).toThrow(/32-byte/u);
    expect(() => parseBackupKey("GENERATE_ME")).toThrow(/configured/u);
  });
});
