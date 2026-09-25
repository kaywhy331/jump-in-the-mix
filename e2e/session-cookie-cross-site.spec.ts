import { createHash, randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { prisma } from "../src/lib/prisma";

const cookieName = process.env.AUTH_COOKIE_NAME ?? "jitm_session";

// Verification links are opened from other sites (webmail, chat apps). The session cookie set inside
// that cross-site redirect chain must still reach /onboarding: a SameSite=Strict cookie is withheld on
// those hops and the person lands on /login as if nothing happened.
test("a verification link opened from another site signs the person in", async ({ page, context }, info) => {
  const suffix = randomUUID();
  const userId = `e2e-cross-site-user-${suffix}`;
  const email = `cross-site-${suffix}@example.test`;
  const token = randomBytes(32).toString("base64url");
  const baseURL = info.project.use.baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
  await prisma.user.create({
    data: {
      id: userId,
      email,
      name: "Cross Site Signup",
      emailVerifiedAt: null,
      ownedWorkspaces: { create: { name: "Cross-site workspace", slug: `e2e-cross-site-${suffix}`, members: { create: { userId, role: "OWNER" } }, profile: { create: { onboardingDone: false } } } }
    }
  });
  await prisma.verificationToken.create({ data: { email, purpose: "verify_email", tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 60 * 60_000) } });
  try {
    const verifyUrl = `${baseURL}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
    await page.route("http://cross-site.test/**", route => route.fulfill({ status: 200, contentType: "text/html", body: `<!doctype html><title>Webmail</title><p>Verify your Jump in the Mix email</p><a href="${verifyUrl}">Verify email</a>` }));
    await page.goto("http://cross-site.test/inbox");
    const verification = page.waitForResponse(response => response.url().startsWith(`${baseURL}/api/auth/verify-email`));
    await page.getByRole("link", { name: "Verify email" }).click();
    const setCookie = (await (await verification).headersArray()).filter(header => header.name.toLowerCase() === "set-cookie").map(header => header.value);
    expect(setCookie.some(value => value.startsWith(`${cookieName}=`) && /samesite=lax/i.test(value))).toBe(true);
    await page.waitForURL(/\/(onboarding|jumps)(\?|$)/);
    expect(new URL(page.url()).pathname).not.toBe("/login");
    await expect(page.getByText("Your email is verified.")).toBeVisible();
    expect((await context.cookies(baseURL)).find(cookie => cookie.name === cookieName)?.sameSite).toBe("Lax");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).emailVerifiedAt).not.toBeNull();
  } finally {
    await prisma.workspace.deleteMany({ where: { ownerId: userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.verificationToken.deleteMany({ where: { email } });
  }
});
