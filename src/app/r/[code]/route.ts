import { NextResponse } from "next/server";
import { REFERRAL_COOKIE, normalizeReferralCode } from "@/lib/referral";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = normalizeReferralCode(rawCode);
  const destination = new URL(code ? `/register?ref=${encodeURIComponent(code)}` : "/register", request.url);
  const response = NextResponse.redirect(destination);
  if (code) {
    response.cookies.set(REFERRAL_COOKIE, code, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 30 * 24 * 60 * 60
    });
  }
  return response;
}
