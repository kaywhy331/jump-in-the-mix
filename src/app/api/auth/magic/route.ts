import { NextResponse } from "next/server";
import { customerReturnPath } from "@/lib/customer-return-path";
import { withSignedError } from "@/lib/form-errors";
import { MAGIC_LINK_INVALID, MAGIC_LINK_PAGE, magicLinkCookieName, magicLinkCookieOptions, magicLinkSecondsLeft } from "@/lib/magic-link";

function seeOther(location: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: location, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" } });
}

// The emailed link. It never spends the token or signs anyone in, because mail scanners and link previews
// open links too: a usable token moves into an HttpOnly cookie scoped to the confirmation page (so it stays
// out of that page's address, history and Referer), and the person presses "Continue signing in" there.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const returnTo = customerReturnPath(url.searchParams.get("next"));
  const secondsLeft = token ? await magicLinkSecondsLeft(token) : null;
  if (!secondsLeft) return seeOther(withSignedError("/login", MAGIC_LINK_INVALID));
  const response = seeOther(returnTo ? `${MAGIC_LINK_PAGE}?${new URLSearchParams({ next: returnTo })}` : MAGIC_LINK_PAGE);
  response.cookies.set(magicLinkCookieName(), token, magicLinkCookieOptions(secondsLeft));
  return response;
}

export const dynamic = "force-dynamic";
