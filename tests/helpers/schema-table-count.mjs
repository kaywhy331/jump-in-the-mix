import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Every Prisma model becomes one ordinary table, and `prisma migrate deploy` adds `_prisma_migrations`. */
export function schemaTableCount(root = process.cwd()) {
  const directory = join(root, "prisma");
  const models = readdirSync(directory).filter((name) => name.endsWith(".prisma"))
    .flatMap((name) => readFileSync(join(directory, name), "utf8").match(/^model\s+\w+\s*\{/gm) ?? []);
  return models.length + 1;
}
