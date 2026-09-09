import { prisma } from "../src/lib/prisma";
import { bootstrapFirstOwner } from "../src/lib/staff-bootstrap";

async function main() {
  const args = process.argv.slice(2);
  const email = args[0] === "--email" && args.length === 2 ? args[1].trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("Usage: npm run admin:bootstrap -- --email owner@example.com");
  const ready = await bootstrapFirstOwner(email);
  console.log(ready ? "Owner bootstrap complete. Sign in again and verify MFA." : "Operator enrollment access prepared. Confirm your email using email-link sign-in, set a password through password recovery, and enroll at /account/admin-mfa. Then repeat this command to finish owner bootstrap. No email has been sent by this command.");
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Owner bootstrap failed."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
