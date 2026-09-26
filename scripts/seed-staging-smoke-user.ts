import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { seedStagingSmokeAccount, StagingSmokeAccountError } from "../src/lib/staging-smoke-account";

// Creates or resets the synthetic account the authenticated staging smoke signs in with
// (`npm run smoke:staging`). Guards: STAGING_SMOKE_TARGET must name the approved staging site;
// an existing account at the address is reset only when it is positively the synthetic one, and
// an ordinary account is refused with nothing written. Address and password come only from the
// environment and are never printed. Run it with the target site's DATABASE_URL.
async function main() {
  if (!process.env.DATABASE_URL?.trim()) throw new StagingSmokeAccountError("DATABASE_URL must be the staging site's database.");
  const result = await seedStagingSmokeAccount(prisma, {
    target: process.env.STAGING_SMOKE_TARGET,
    email: process.env.STAGING_SMOKE_USER_EMAIL,
    password: process.env.STAGING_SMOKE_USER_PASSWORD,
    hash: (password) => bcrypt.hash(password, 12)
  });
  console.log(result.outcome === "created" ? "Created the staging smoke account." : "Reset the staging smoke account's password.");
}

main()
  .catch((error) => { console.error(error instanceof StagingSmokeAccountError ? error.message : "Seeding the staging smoke account failed."); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
