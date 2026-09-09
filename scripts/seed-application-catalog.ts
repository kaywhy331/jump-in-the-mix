import "dotenv/config";
import { checkDatabaseRelease } from "../src/lib/database-release";
import { installApplicationCatalog } from "../src/lib/install-application-catalog";
import { prisma } from "../src/lib/prisma";

async function main() {
  if (!process.env.DATABASE_URL?.trim() && !process.env.NETLIFY_DB_URL?.trim()) throw new Error("Set DATABASE_URL before installing the application catalog.");
  const release = await checkDatabaseRelease(prisma, { requireHistory: true });
  if (release.status !== "ready") throw new Error(`Application catalog requires a ready database release (${release.status}).`);
  console.log(JSON.stringify(await installApplicationCatalog()));
}

// This entry point never imports or creates demo accounts, regardless of mode.
main().catch(error => {
  console.error(error instanceof Error && error.message.startsWith("Application catalog requires")
    ? error.message : "Application catalog installation failed. Check the private database configuration.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
