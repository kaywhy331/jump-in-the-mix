import { NextResponse } from "next/server";
import { REFERRAL_COOKIE } from "@/lib/referral";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/register", request.url));
  response.cookies.delete(REFERRAL_COOKIE);
  return response;
}
