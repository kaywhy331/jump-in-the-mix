import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";
import { createSocialAuthorization, SocialAuthError, socialStartFailurePath } from "@/lib/social-auth";

// The request can carry an invitation token, so it must never be cached or passed on as a referrer. Our own
// pages are addressed from the public APP_URL, never the internal request address behind the hosting proxy.
function redirectTo(url: URL | string): NextResponse {
  const response = NextResponse.redirect(typeof url === "string" ? new URL(url, env.appUrl) : url);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  // A sign-up from an invitation page (/register?invite=…) carries the invitation; a failure returns there.
  const invite = params.get("invite");
  // Every start stores a one-time state row, so anonymous starts are limited per client address.
  const { ipAddress } = await getRequestMetadata();
  const limit = await consumeRateLimit({ scope: "auth.oauth.start.ip", identifiers: [ipAddress], limit: 30, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 });
  if (!limit.allowed) return redirectTo(socialStartFailurePath("Too many sign-in attempts. Try again in 15 minutes.", invite));
  try {
    return redirectTo(await createSocialAuthorization("GOOGLE", params.get("returnTo"), invite));
  } catch (error) {
    // Only our own fixed wording reaches the page (signed); anything else gets a fixed sentence of its own.
    if (error instanceof SocialAuthError) return redirectTo(socialStartFailurePath(error.message, invite));
    console.error("Google sign-in could not be started", error);
    return redirectTo(socialStartFailurePath("Google sign-in could not be started.", invite));
  }
}
