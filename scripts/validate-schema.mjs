import { readFileSync } from "node:fs";
import * as prismaSchema from "@prisma/prisma-schema-wasm";

const path = "prisma/schema.prisma";
const schema = readFileSync(path, "utf8");

try {
  prismaSchema.validate(JSON.stringify({ prismaSchema: [[path, schema]], noColor: true }));
  console.log(`[OK] Prisma schema is valid: ${path}`);
} catch (error) {
  console.error(`[FAIL] Prisma schema validation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
