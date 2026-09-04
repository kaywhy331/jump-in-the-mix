import { AUTH_TOKEN_PURPOSES, issueAuthToken } from "../src/lib/auth-tokens";
import { env } from "../src/lib/env";
import { prisma } from "../src/lib/prisma";

const email = String(process.argv[2] ?? "").trim().toLowerCase();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("Pass the owner's email address.");
  process.exitCode = 1;
} else {
  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { email: true } });
    if (!user) {
      console.error("No account uses that email address.");
      process.exitCode = 1;
    } else {
      const token = await issueAuthToken(user.email, AUTH_TOKEN_PURPOSES.resetPassword, env.passwordResetMinutes * 60 * 1000);
      const url = new URL(`/reset-password?token=${encodeURIComponent(token)}`, env.appUrl);
      console.log(`One-time password reset link (expires in ${env.passwordResetMinutes} minutes):`);
      console.log(url.toString());
    }
  } finally {
    await prisma.$disconnect();
  }
}
