import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { withSignedError } from "@/lib/form-errors";
import { prisma } from "@/lib/prisma";
import { knownDeviceCookie, knownDeviceCookieName } from "@/lib/rate-limit";
import { completeSocialAuthorization, socialAuthFailurePath } from "@/lib/social-auth";

/*
 * Apple posts the result across sites (response_mode=form_post). Every answer is a 303, so the browser
 * follows with a GET: a 307 would repeat the POST to the destination page, which the origin check in
 * src/proxy.ts refuses (it accepts Apple's origin on this callback only). Absolute URLs use the public
 * APP_URL, never the internal request address behind the hosting proxy.
 */
function seeOther(path: string): NextResponse {
  return NextResponse.redirect(new URL(path, env.appUrl), 303);
}

async function complete(request: Request) {
  const values = request.method === "POST"
    ? await request.formData()
    : new URL(request.url).searchParams;
  let destination: string;
  try {
    const result = await completeSocialAuthorization({
      provider: "APPLE",
      state: String(values.get("state") ?? ""),
      code: String(values.get("code") ?? ""),
      appleUser: values.get("user") ? String(values.get("user")) : null,
      canceled: Boolean(values.get("error"))
    });
    // createSession refuses a suspended account with a redirect of its own (a 307); answer it here as a 303.
    if ((await prisma.user.findUnique({ where: { id: result.userId }, select: { suspendedAt: true } }))?.suspendedAt) {
      return seeOther(withSignedError("/login", "Account access is unavailable. Contact support for help."));
    }
    await createSession(result.userId);
    // This browser has now signed in to the account: the sign-in abuse limits no longer apply to it. Apple
    // posts cross-site, so a Lax marker for other accounts on this browser is not sent and is replaced.
    const store = await cookies();
    const device = knownDeviceCookie(store.get(knownDeviceCookieName())?.value, result.userId);
    store.set(device.name, device.value, device.options);
    destination = result.returnTo;
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    // Only our own fixed wording is signed for the page: back to the invitation the sign-up started from, else to sign-in.
    destination = await socialAuthFailurePath("APPLE", error);
  }
  return seeOther(destination);
}

export async function GET(request: Request) { return complete(request); }
export async function POST(request: Request) { return complete(request); }
