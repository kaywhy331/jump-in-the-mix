import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as prismaSchema from "@prisma/prisma-schema-wasm";

const directory = "prisma";
const files = readdirSync(directory)
  .filter((name) => name.endsWith(".prisma"))
  .sort()
  .map((name) => {
    const path = join(directory, name);
    return [path, readFileSync(path, "utf8")];
  });

try {
  prismaSchema.validate(JSON.stringify({ prismaSchema: files, noColor: true }));
  console.log(`[OK] Prisma schema is valid: ${files.map(([path]) => path).join(", ")}`);
} catch (error) {
  console.error(`[FAIL] Prisma schema validation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
