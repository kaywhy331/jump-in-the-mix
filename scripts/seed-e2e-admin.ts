import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const email = (process.env.E2E_ADMIN_EMAIL ?? "admin-e2e@jumpinthemix.local").trim().toLowerCase();
const password = process.env.E2E_ADMIN_PASSWORD ?? "AdminJumpInTheMix123!";
const workspaceId = process.env.E2E_WORKSPACE_ID ?? "demo_workspace";

async function main() {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
  if (!workspace) throw new Error("Run the demo seed before seeding the browser-test administrator.");

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      id: "e2e_admin_user",
      email,
      name: "E2E Platform Admin",
      passwordHash,
      emailVerifiedAt: new Date(),
      isPlatformAdmin: true
    },
    update: {
      name: "E2E Platform Admin",
      passwordHash,
      emailVerifiedAt: new Date(),
      isPlatformAdmin: true
    }
  });

  await prisma.staffMembership.upsert({ where: { userId: user.id }, create: { userId: user.id, role: "OWNER", grants: ["support.view_customer"] }, update: { role: "OWNER", status: "ACTIVE", grants: ["support.view_customer"], denies: [] } });

  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId, userId: user.id } },
    create: { id: "e2e_admin_membership", workspaceId, userId: user.id, role: "OWNER" },
    update: { role: "OWNER" }
  });
  await prisma.adminMfaSession.deleteMany({ where: { userId: user.id } });
  await prisma.adminMfaCredential.deleteMany({ where: { userId: user.id } });
  console.log(`Seeded browser-test administrator ${email}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
