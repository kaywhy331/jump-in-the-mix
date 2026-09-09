import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, expect, it } from "vitest";
import { schemaRelease } from "../scripts/generate-schema-release.mjs";
let root;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "jitm-schema-release-"));
  await mkdir(join(root, "prisma/migrations/20260101000000_example"), { recursive: true });
  await writeFile(join(root, "prisma/schema.prisma"), `datasource db {
  provider = "postgresql"
}
enum MailState {
  WAITING @map("pending")
  SENT
}
model Example {
  id String @id @map("record_id")
  labels String[]
  state MailState @default(WAITING)
  day DateTime @db.Date
  @@map("example_records")
}
`);
  await writeFile(join(root, "prisma/migrations/20260101000000_example/migration.sql"), "-- exact source bytes\n");
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });
it("freezes exact SQL checksums and database names, native types, arrays and enum labels", () => {
  const release = schemaRelease(root);
  expect(release.migrations).toEqual([{ name: "20260101000000_example", checksum: createHash("sha256").update("-- exact source bytes\n").digest("hex") }]);
  expect(release.columns).toEqual([
    { table: "example_records", column: "record_id", type: "text", list: false, enum: false },
    { table: "example_records", column: "labels", type: "text", list: true, enum: false },
    { table: "example_records", column: "state", type: "MailState", list: false, enum: true },
    { table: "example_records", column: "day", type: "date", list: false, enum: false }
  ]);
  expect(release.enums).toEqual([{ type: "MailState", value: "pending" }, { type: "MailState", value: "SENT" }]);
});
it("rebuilding the manifest detects edited migration bytes without inventing schema changes", async () => {
  const before = schemaRelease(root);
  await writeFile(join(root, "prisma/migrations/20260101000000_example/migration.sql"), "-- different source bytes\n");
  const after = schemaRelease(root);
  expect(after.migrations[0].checksum).not.toBe(before.migrations[0].checksum); expect(after.columns).toEqual(before.columns);
});
