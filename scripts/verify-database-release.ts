import "dotenv/config";
import { checkDatabaseRelease } from "../src/lib/database-release";
import { prisma } from "../src/lib/prisma";

async function main() {
  if (!process.env.DATABASE_URL?.trim() && !process.env.NETLIFY_DB_URL?.trim()) throw new Error("Set DATABASE_URL before verifying a release.");
  const result = await checkDatabaseRelease(prisma, { requireHistory: true });
  console.log(JSON.stringify(result));
  if (result.status !== "ready") process.exitCode = 1;
}
main().catch(() => { console.error("Database release verification failed. Check the private database configuration."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
