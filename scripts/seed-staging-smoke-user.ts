import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

// Creates or resets the synthetic account the authenticated staging smoke signs in with
// (`npm run smoke:staging`). The address and password come only from the environment and are
// never printed. The account is an ordinary verified business owner with an empty workspace:
// no invitation, no staff role, no customer data. Run it with the target site's DATABASE_URL.
const email = (process.env.STAGING_SMOKE_USER_EMAIL ?? "").trim().toLowerCase();
const password = process.env.STAGING_SMOKE_USER_PASSWORD ?? "";

async function main() {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("STAGING_SMOKE_USER_EMAIL must be a valid address.");
  if (password.length < 24 || password.length > 72) throw new Error("STAGING_SMOKE_USER_PASSWORD must be 24 to 72 characters.");
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, emailVerifiedAt: new Date() } });
    console.log("Reset the staging smoke account's password.");
    return;
  }
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, name: "Staging smoke (synthetic)", passwordHash, emailVerifiedAt: new Date() }, select: { id: true } });
    const workspace = await tx.workspace.create({
      data: {
        name: "Staging smoke workspace",
        slug: `staging-smoke-${user.id.slice(-7)}`,
        ownerId: user.id,
        members: { create: { userId: user.id, role: "OWNER" } },
        profile: { create: { onboardingDone: true } }
      },
      select: { id: true }
    });
    await tx.userPreference.create({ data: { userId: user.id, timezone: "UTC" } });
    await tx.workspacePreference.create({ data: { workspaceId: workspace.id } });
    await tx.notificationPreference.create({ data: { workspaceId: workspace.id, userId: user.id, emailDigestEnabled: false, weeklyReportEnabled: false } });
  });
  console.log("Created the staging smoke account.");
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : "Seeding the staging smoke account failed."); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
