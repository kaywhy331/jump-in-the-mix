import { redirect } from "next/navigation";
import { createBusinessAccount, nameFromEmail } from "@/lib/account-provisioning";
import { createSession } from "@/lib/auth";
import { AUTH_TOKEN_PURPOSES, findUsableAuthToken, hashAuthToken } from "@/lib/auth-tokens";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const record = await findUsableAuthToken(token, AUTH_TOKEN_PURPOSES.magicLogin);
  if (!record) redirect("/login?error=That%20sign-in%20link%20is%20invalid%20or%20expired.");
  try {
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.verificationToken.updateMany({
        where: { id: record.id, tokenHash: hashAuthToken(token), purpose: AUTH_TOKEN_PURPOSES.magicLogin, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() }
      });
      if (claimed.count !== 1) throw new Error("That sign-in link was already used.");
      let user = await tx.user.findUnique({ where: { email: record.email }, select: { id: true, memberships: { select: { workspace: { select: { profile: { select: { onboardingDone: true } } } } }, take: 1 } } });
      if (!user) {
        if (env.pilotMode && await tx.user.count() > 0) throw new Error("Owner setup is already complete on this server.");
        const created = await createBusinessAccount(tx, { email: record.email, name: nameFromEmail(record.email), passwordHash: null, emailVerifiedAt: new Date() });
        return { userId: created.id, destination: "/onboarding" };
      }
      await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
      return { userId: user.id, destination: user.memberships[0]?.workspace.profile?.onboardingDone ? "/jumps" : "/onboarding" };
    }, { isolationLevel: "Serializable" });
    await createSession(result.userId);
    redirect(result.destination);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    const message = error instanceof Error ? error.message : "The sign-in link could not be used.";
    redirect(`/login?error=${encodeURIComponent(message)}`);
  }
}
