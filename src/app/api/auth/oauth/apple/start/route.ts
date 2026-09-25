import { NextResponse } from "next/server";
import { withSignedError } from "@/lib/form-errors";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRequestMetadata } from "@/lib/request-context";
import { createSocialAuthorization } from "@/lib/social-auth";

function signInError(request: Request, message: string): NextResponse {
  return NextResponse.redirect(new URL(withSignedError("/login", message), request.url));
}

export async function GET(request: Request) {
  // Every start stores a one-time state row, so anonymous starts are limited per client address.
  const { ipAddress } = await getRequestMetadata();
  const limit = await consumeRateLimit({ scope: "auth.oauth.start.ip", identifiers: [ipAddress], limit: 30, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 });
  if (!limit.allowed) return signInError(request, "Too many sign-in attempts. Try again in 15 minutes.");
  try {
    const url = await createSocialAuthorization("APPLE", new URL(request.url).searchParams.get("returnTo"));
    return NextResponse.redirect(url);
  } catch (error) {
    // Only the configuration message is our fixed wording; anything else gets a fixed sentence of its own.
    if (error instanceof Error && error.message === "Apple sign-in is not configured.") return signInError(request, error.message);
    console.error("Apple sign-in could not be started", error);
    return signInError(request, "Apple sign-in could not be started.");
  }
}
